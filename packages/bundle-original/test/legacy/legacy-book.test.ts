import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBooksDbAdapter,
  createMemoryBookStore,
  readStoredFiscalPeriodIds,
  type BooksDbAdapter,
  type BookStore,
} from "@rubydogjp/openkk-books-db-adapter";
import type { OpenkkFiscalPeriodLabel } from "@rubydogjp/openkk-driver";

import { createDiskDbAdapter } from "../../../disk-db-adapter/src/index.js";
import {
  createLegacyBook,
  createLegacyUnmovedFiscalPeriodsRecord,
  splitLegacyDatabaseIntoPeriods,
  type LegacyBookDependencies,
} from "../../app/legacy/legacy-book";

const USER = "openkk-original-user";
const tempDirs: string[] = [];
const openAdapters: BooksDbAdapter[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const line = {
  partnerName: "",
  taxCategoryId: "tax_out_of_scope",
  businessCategoryId: "",
};

async function legacyDatabaseFile(periodCount: number): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-legacy-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "openkk.sqlite3");
  const legacy = await createDiskDbAdapter(filePath, null);
  for (let index = 0; index < periodCount; index += 1) {
    const year = 2025 + index;
    const period = await legacy.db.fiscalPeriods.create(USER, {
      name: `${year}年分`,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    });
    await legacy.db.fiscalPeriods.start(period.id);
    await legacy.db.entries.create(USER, period.id, {
      date: `${year}-06-01`,
      description: `${year}年の売上`,
      localId: null,
      businessRate: 1,
      lines: [
        { ...line, side: "debit", bookAccountId: "acct_cash", amount: year },
        { ...line, side: "credit", bookAccountId: "acct_sales", amount: year },
      ],
    });
  }
  legacy.close();
  return filePath;
}

async function legacyDatabaseBytes(periodCount: number): Promise<Uint8Array> {
  return new Uint8Array(fs.readFileSync(await legacyDatabaseFile(periodCount)));
}

const UNREADABLE_PHASE_SQL =
  "UPDATE fiscal_periods SET data = json_set(data, '$.phase', 'unknown_phase') WHERE json_extract(data, '$.name') = ?";
const UNREADABLE_ROW_SQL =
  "UPDATE fiscal_periods SET data = 'not a record' WHERE json_extract(data, '$.name') = ?";

async function legacyDatabaseBytesWithUnreadable(
  periodCount: number,
  unreadable: ReadonlyArray<{ name: string; sql: string }>,
): Promise<Uint8Array> {
  const filePath = await legacyDatabaseFile(periodCount);
  const database = new DatabaseSync(filePath);
  try {
    database.exec("PRAGMA ignore_check_constraints = ON");
    for (const { name, sql } of unreadable) database.prepare(sql).run(name);
  } finally {
    database.close();
  }
  return new Uint8Array(fs.readFileSync(filePath));
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

function setup(
  legacyBytes: Uint8Array | null,
  overrides: Partial<LegacyBookDependencies>,
) {
  const state = { moved: false, nextBook: 1 };
  const dependencies: LegacyBookDependencies = {
    marker: {
      isMoved: async () => state.moved,
      markMoved: async () => {
        state.moved = true;
      },
    },
    unmovedFiscalPeriodsRecord:
      createLegacyUnmovedFiscalPeriodsRecord(memoryStorage()),
    exportLegacyDatabase: vi.fn(async () => legacyBytes),
    splitIntoPeriods: splitLegacyDatabaseIntoPeriods,
    storedFiscalPeriodIds: readStoredFiscalPeriodIds,
    newBookName: () => `moved-${state.nextBook++}.openkk`,
    ...overrides,
  };
  return { state, dependencies, legacyBook: createLegacyBook(dependencies) };
}

async function openBooks(store: BookStore): Promise<BooksDbAdapter> {
  const adapter = await createBooksDbAdapter({
    store,
    newBookName: () => "new.openkk",
    onFiscalPeriodRemoved: () => {},
    onSaveError: () => {},
  });
  openAdapters.push(adapter);
  return adapter;
}

function emptyStore(): BookStore {
  return createMemoryBookStore(new Map());
}

describe("legacy book", () => {
  it("moves each fiscal period of the previous version into its own book", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(await legacyDatabaseBytes(2), {});

    const { movedFiscalPeriodIds: moved, unmovedFiscalPeriods } =
      await legacyBook.moveInto(store, () => {});
    const books = await openBooks(store);
    const periods = await books.db.fiscalPeriods.getAll(USER);

    expect(moved).toHaveLength(2);
    expect(unmovedFiscalPeriods).toEqual([]);
    expect(state.moved).toBe(true);
    expect(await store.list()).toHaveLength(2);
    expect(periods.map(({ name, phase }) => [name, phase])).toEqual([
      ["2025年分", "journalizing"],
      ["2026年分", "journalizing"],
    ]);
    expect(periods.map(({ id }) => id).sort()).toEqual([...moved].sort());
    for (const period of periods) {
      const entries = await books.db.entries.getAll(period.id);
      expect(entries.map(({ description }) => description)).toEqual([
        `${period.startDate.slice(0, 4)}年の売上`,
      ]);
    }
    expect(books.unreadableBooks).toEqual([]);
  });

  it("does not read the previous version again once it was moved", async () => {
    const store = emptyStore();
    const { legacyBook, dependencies } = setup(
      await legacyDatabaseBytes(1),
      {},
    );

    await legacyBook.moveInto(store, () => {});
    const again = await legacyBook.moveInto(store, () => {});

    expect(again).toEqual({
      movedFiscalPeriodIds: [],
      unmovedFiscalPeriods: [],
    });
    expect(dependencies.exportLegacyDatabase).toHaveBeenCalledTimes(1);
    expect(await store.list()).toHaveLength(1);
  });

  it("marks the move as done when there is no previous version", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(null, {});

    expect(await legacyBook.moveInto(store, () => {})).toEqual({
      movedFiscalPeriodIds: [],
      unmovedFiscalPeriods: [],
    });
    expect(state.moved).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("marks the move as done when the previous version holds no fiscal period", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(await legacyDatabaseBytes(0), {});

    expect(await legacyBook.moveInto(store, () => {})).toEqual({
      movedFiscalPeriodIds: [],
      unmovedFiscalPeriods: [],
    });
    expect(state.moved).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("continues after a stopped move without storing a period twice", async () => {
    const inner = emptyStore();
    let writes = 0;
    const failingOnSecondWrite: BookStore = {
      list: () => inner.list(),
      read: (name) => inner.read(name),
      remove: (name) => inner.remove(name),
      async write(name, bytes) {
        writes += 1;
        if (writes === 2) throw new Error("no space left");
        await inner.write(name, bytes);
      },
    };
    const { legacyBook, state } = setup(await legacyDatabaseBytes(3), {});

    await expect(
      legacyBook.moveInto(failingOnSecondWrite, () => {}),
    ).rejects.toThrow("no space left");
    const movedAfterFailure = state.moved;
    const storedAfterFailure = (await inner.list()).length;
    const resumed = await legacyBook.moveInto(failingOnSecondWrite, () => {});
    const books = await openBooks(inner);

    expect(movedAfterFailure).toBe(false);
    expect(storedAfterFailure).toBe(1);
    expect(resumed.movedFiscalPeriodIds).toHaveLength(2);
    expect(state.moved).toBe(true);
    expect(await inner.list()).toHaveLength(3);
    expect(await books.db.fiscalPeriods.getAll(USER)).toHaveLength(3);
    expect(books.unreadableBooks).toEqual([]);
  });

  it("moves the periods it can read and remembers the one it cannot", async () => {
    const store = emptyStore();
    const { legacyBook, state, dependencies } = setup(
      await legacyDatabaseBytesWithUnreadable(3, [
        { name: "2026年分", sql: UNREADABLE_PHASE_SQL },
      ]),
      {},
    );
    const unmoved: OpenkkFiscalPeriodLabel[] = [
      { name: "2026年分", startDate: "2026-01-01", endDate: "2026-12-31" },
    ];

    const first = await legacyBook.moveInto(store, () => {});
    const again = await legacyBook.moveInto(store, () => {});
    const books = await openBooks(store);
    const periods = await books.db.fiscalPeriods.getAll(USER);

    expect(first.movedFiscalPeriodIds).toHaveLength(2);
    expect(first.unmovedFiscalPeriods).toEqual(unmoved);
    expect(state.moved).toBe(true);
    expect(again).toEqual({
      movedFiscalPeriodIds: [],
      unmovedFiscalPeriods: unmoved,
    });
    expect(dependencies.exportLegacyDatabase).toHaveBeenCalledTimes(1);
    expect(periods.map(({ name }) => name)).toEqual(["2025年分", "2027年分"]);
    for (const period of periods) {
      expect(await books.db.entries.getAll(period.id)).toHaveLength(1);
    }
    expect(books.unreadableBooks).toEqual([]);
  });

  it("starts with no book when it can read none of the periods", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(
      await legacyDatabaseBytesWithUnreadable(2, [
        { name: "2025年分", sql: UNREADABLE_PHASE_SQL },
        { name: "2026年分", sql: UNREADABLE_ROW_SQL },
      ]),
      {},
    );

    const move = await legacyBook.moveInto(store, () => {});

    expect(move).toEqual({
      movedFiscalPeriodIds: [],
      unmovedFiscalPeriods: [
        { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
        { name: null, startDate: null, endDate: null },
      ],
    });
    expect(state.moved).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("remembers one nameless period when the previous version is not a book at all", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(
      new TextEncoder().encode("this is not a database"),
      {},
    );

    const move = await legacyBook.moveInto(store, () => {});

    expect(move).toEqual({
      movedFiscalPeriodIds: [],
      unmovedFiscalPeriods: [{ name: null, startDate: null, endDate: null }],
    });
    expect(state.moved).toBe(true);
  });

  it("finds the same unreadable period again after a stopped move", async () => {
    const inner = emptyStore();
    let writes = 0;
    const failingOnSecondWrite: BookStore = {
      list: () => inner.list(),
      read: (name) => inner.read(name),
      remove: (name) => inner.remove(name),
      async write(name, bytes) {
        writes += 1;
        if (writes === 2) throw new Error("no space left");
        await inner.write(name, bytes);
      },
    };
    const { legacyBook, state } = setup(
      await legacyDatabaseBytesWithUnreadable(3, [
        { name: "2025年分", sql: UNREADABLE_PHASE_SQL },
      ]),
      {},
    );

    await expect(
      legacyBook.moveInto(failingOnSecondWrite, () => {}),
    ).rejects.toThrow("no space left");
    const movedAfterFailure = state.moved;
    const resumed = await legacyBook.moveInto(failingOnSecondWrite, () => {});

    expect(movedAfterFailure).toBe(false);
    expect(resumed.movedFiscalPeriodIds).toHaveLength(1);
    expect(resumed.unmovedFiscalPeriods).toEqual([
      { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
    ]);
    expect(await inner.list()).toHaveLength(2);
  });

  it("does not mark the move when the list of unmoved periods cannot be stored, and moves nothing twice next time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = emptyStore();
    const items = new Map<string, string>();
    let storageWorks = false;
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (storageWorks) items.set(key, value);
      },
      removeItem: (key: string) => {
        items.delete(key);
      },
    };
    const { legacyBook, state } = setup(
      await legacyDatabaseBytesWithUnreadable(2, [
        { name: "2025年分", sql: UNREADABLE_PHASE_SQL },
      ]),
      {
        unmovedFiscalPeriodsRecord:
          createLegacyUnmovedFiscalPeriodsRecord(storage),
      },
    );

    await expect(legacyBook.moveInto(store, () => {})).rejects.toThrow(
      /could not be moved was not stored/,
    );
    const movedAfterFailure = state.moved;
    storageWorks = true;
    const resumed = await legacyBook.moveInto(store, () => {});

    expect(movedAfterFailure).toBe(false);
    expect(resumed.movedFiscalPeriodIds).toEqual([]);
    expect(resumed.unmovedFiscalPeriods).toEqual([
      { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
    ]);
    expect(state.moved).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });

  it("writes down why a period could not be moved", async () => {
    const logged: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });

    await splitLegacyDatabaseIntoPeriods(
      await legacyDatabaseBytesWithUnreadable(2, [
        { name: "2025年分", sql: UNREADABLE_PHASE_SQL },
      ]),
    );

    expect(logged.map(([message]) => String(message))).toEqual([
      expect.stringMatching(/cannot be read/),
    ]);
    expect(String(logged[0]?.[1])).toMatch(/phase/);
  });

  it("ignores a remembered list it cannot read", () => {
    const storage = memoryStorage();
    const record = createLegacyUnmovedFiscalPeriodsRecord(storage);
    storage.setItem("openkk.legacy-book.unmoved-fiscal-periods", "{broken");

    expect(record.read()).toEqual([]);
  });

  it("stores nothing and does not mark the move when the previous version cannot be split", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(await legacyDatabaseBytes(2), {
      splitIntoPeriods: async () => {
        throw new Error("split mismatch");
      },
    });

    await expect(legacyBook.moveInto(store, () => {})).rejects.toThrow(
      "split mismatch",
    );
    expect(state.moved).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("does not mark the move when the previous version cannot be read", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(null, {
      exportLegacyDatabase: async () => {
        throw new Error("read failed");
      },
    });

    await expect(legacyBook.moveInto(store, () => {})).rejects.toThrow(
      "read failed",
    );
    expect(state.moved).toBe(false);
  });

  it("tells when it waits for a tab of the previous version", async () => {
    const onWaiting = vi.fn();
    const { legacyBook } = setup(null, {
      exportLegacyDatabase: async (onWaitingForAnotherTab) => {
        onWaitingForAnotherTab();
        return null;
      },
    });

    await legacyBook.moveInto(emptyStore(), onWaiting);

    expect(onWaiting).toHaveBeenCalledTimes(1);
  });
});
