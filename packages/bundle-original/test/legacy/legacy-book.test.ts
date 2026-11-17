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
import { createLocalBookFilesAdapter } from "@rubydogjp/openkk-local-book-files-adapter";

import {
  createLegacyBook,
  createLegacyBookWatchRecordStore,
  createLegacyMergedFiscalPeriodsRecord,
  createLegacyUnmovedFiscalPeriodsRecord,
  splitLegacyDatabaseIntoPeriods,
  type LegacyBookDependencies,
} from "../../app/legacy/legacy-book";
import {
  canonicalPeriodContent,
  fingerprintBytes,
} from "../../app/legacy/legacy-fingerprint";

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
    mergedFiscalPeriodsRecord:
      createLegacyMergedFiscalPeriodsRecord(memoryStorage()),
    watchRecord: createLegacyBookWatchRecordStore(memoryStorage()),
    fingerprintDatabase: fingerprintBytes,
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
      mergedFiscalPeriods: [],
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
      mergedFiscalPeriods: [],
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
      mergedFiscalPeriods: [],
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
      mergedFiscalPeriods: [],
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
      mergedFiscalPeriods: [],
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
      mergedFiscalPeriods: [],
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

async function changeLegacyDatabase(
  filePath: string,
  change: (
    legacy: Awaited<ReturnType<typeof createDiskDbAdapter>>,
  ) => Promise<void>,
): Promise<Uint8Array> {
  const legacy = await createDiskDbAdapter(filePath, null);
  try {
    await change(legacy);
  } finally {
    legacy.close();
  }
  return new Uint8Array(fs.readFileSync(filePath));
}

async function periodIdNamed(
  legacy: Awaited<ReturnType<typeof createDiskDbAdapter>>,
  name: string,
): Promise<string> {
  const periods = await legacy.db.fiscalPeriods.getAll(USER);
  return periods.find((period) => period.name === name)!.id;
}

async function addLegacySale(
  legacy: Awaited<ReturnType<typeof createDiskDbAdapter>>,
  fiscalPeriodId: string,
  description: string,
): Promise<void> {
  await legacy.db.entries.create(USER, fiscalPeriodId, {
    date: "2025-07-01",
    description,
    localId: null,
    businessRate: 1,
    lines: [
      { ...line, side: "debit", bookAccountId: "acct_cash", amount: 500 },
      { ...line, side: "credit", bookAccountId: "acct_sales", amount: 500 },
    ],
  });
}

function watchedSetup(filePath: string, storage = memoryStorage()) {
  const current: { bytes: Uint8Array } = {
    bytes: new Uint8Array(fs.readFileSync(filePath)),
  };
  const splitIntoPeriods = vi.fn(splitLegacyDatabaseIntoPeriods);
  const prepared = setup(null, {
    watchRecord: createLegacyBookWatchRecordStore(storage),
    exportLegacyDatabase: vi.fn(async () => current.bytes),
    splitIntoPeriods,
  });
  return { ...prepared, current, splitIntoPeriods, storage };
}

describe("legacy book: changes made in the previous version after the move", () => {
  it("remembers the fingerprint of each period and the stamp of the book it moved into", async () => {
    const store = emptyStore();
    const filePath = await legacyDatabaseFile(2);
    const { legacyBook, storage } = watchedSetup(filePath);

    await legacyBook.moveInto(store, () => {});
    const books = await openBooks(store);
    const record = JSON.parse(storage.getItem("openkk.legacy-book.watch")!);

    expect(record.databaseFingerprint).toBe(
      await fingerprintBytes(new Uint8Array(fs.readFileSync(filePath))),
    );
    expect(
      record.periods.map(
        (period: { label: { name: string }; movedLastChangedAt: number }) => [
          period.label.name,
          period.movedLastChangedAt,
        ],
      ),
    ).toEqual(
      record.periods.map(
        (period: { fiscalPeriodId: string; label: { name: string } }) => [
          period.label.name,
          books.lastChangedAt(period.fiscalPeriodId),
        ],
      ),
    );
    expect(record.periods).toHaveLength(2);
  });

  it("does not split the previous version again while it has not changed", async () => {
    const store = emptyStore();
    const { legacyBook, splitIntoPeriods } = watchedSetup(
      await legacyDatabaseFile(2),
    );
    await legacyBook.moveInto(store, () => {});
    splitIntoPeriods.mockClear();

    expect(await legacyBook.detectChanges()).toBeNull();
    expect(splitIntoPeriods).not.toHaveBeenCalled();
  });

  it("finds nothing before the move", async () => {
    const { legacyBook, dependencies } = watchedSetup(
      await legacyDatabaseFile(1),
    );

    expect(await legacyBook.detectChanges()).toBeNull();
    expect(dependencies.exportLegacyDatabase).not.toHaveBeenCalled();
  });

  it("finds the periods changed, added and removed in the previous version", async () => {
    const store = emptyStore();
    const filePath = await legacyDatabaseFile(2);
    const { legacyBook, current, storage } = watchedSetup(filePath);
    await legacyBook.moveInto(store, () => {});
    const moved = JSON.parse(storage.getItem("openkk.legacy-book.watch")!);
    current.bytes = await changeLegacyDatabase(filePath, async (legacy) => {
      await addLegacySale(
        legacy,
        await periodIdNamed(legacy, "2025年分"),
        "前の版で足した売上",
      );
      await legacy.db.fiscalPeriods.remove(
        await periodIdNamed(legacy, "2026年分"),
      );
      await legacy.db.fiscalPeriods.create(USER, {
        name: "2027年分",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      });
    });

    const changes = await legacyBook.detectChanges();

    expect(
      changes?.changed.map(({ label, movedLastChangedAt }) => [
        label.name,
        movedLastChangedAt,
      ]),
    ).toEqual([
      [
        "2025年分",
        moved.periods.find(
          (period: { label: { name: string } }) =>
            period.label.name === "2025年分",
        ).movedLastChangedAt,
      ],
      ["2027年分", null],
    ]);
    expect(changes?.removed).toEqual([
      { name: "2026年分", startDate: "2026-01-01", endDate: "2026-12-31" },
    ]);
  });

  it("finds the same changes again until they are accepted, and nothing after", async () => {
    const store = emptyStore();
    const filePath = await legacyDatabaseFile(1);
    const { legacyBook, current, storage } = watchedSetup(filePath);
    await legacyBook.moveInto(store, () => {});
    current.bytes = await changeLegacyDatabase(filePath, async (legacy) =>
      addLegacySale(
        legacy,
        await periodIdNamed(legacy, "2025年分"),
        "前の版で足した売上",
      ),
    );

    const first = await legacyBook.detectChanges();
    const second = await legacyBook.detectChanges();
    const fiscalPeriodId = second!.changed[0]!.fiscalPeriodId;
    second!.accept(new Map([[fiscalPeriodId, 12345]]));
    const record = JSON.parse(storage.getItem("openkk.legacy-book.watch")!);

    expect(first?.changed).toHaveLength(1);
    expect(second?.changed).toHaveLength(1);
    expect(await legacyBook.detectChanges()).toBeNull();
    expect(record.periods).toEqual([
      expect.objectContaining({ fiscalPeriodId, movedLastChangedAt: 12345 }),
    ]);
  });

  it("takes the previous version as it is when nothing was remembered, and watches it from then on", async () => {
    const store = emptyStore();
    const filePath = await legacyDatabaseFile(1);
    const { legacyBook, current, storage } = watchedSetup(filePath);
    await legacyBook.moveInto(store, () => {});
    storage.removeItem("openkk.legacy-book.watch");

    const firstLook = await legacyBook.detectChanges();
    current.bytes = await changeLegacyDatabase(filePath, async (legacy) =>
      addLegacySale(
        legacy,
        await periodIdNamed(legacy, "2025年分"),
        "前の版で足した売上",
      ),
    );
    const changes = await legacyBook.detectChanges();

    expect(firstLook).toBeNull();
    expect(
      changes?.changed.map(({ label, movedLastChangedAt }) => [
        label.name,
        movedLastChangedAt,
      ]),
    ).toEqual([["2025年分", null]]);
  });

  it("does not mark the move when what it moved cannot be remembered", async () => {
    const store = emptyStore();
    const broken = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const { legacyBook, state } = watchedSetup(
      await legacyDatabaseFile(1),
      broken,
    );

    await expect(legacyBook.moveInto(store, () => {})).rejects.toThrow(
      /was not remembered/,
    );
    expect(state.moved).toBe(false);
  });

  it("reads the same fingerprint however the records are ordered", async () => {
    const entries = [
      { id: "e-2", amount: 1 },
      { id: "e-1", amount: 2 },
    ];
    const fixedAssets = [{ id: "fa-1" }];

    expect(
      canonicalPeriodContent({
        fiscalPeriod: { name: "2025年分", id: "fp" },
        entries,
        fixedAssets,
      }),
    ).toBe(
      canonicalPeriodContent({
        fiscalPeriod: { id: "fp", name: "2025年分" },
        entries: [...entries]
          .reverse()
          .map(({ amount, id }) => ({ amount, id })),
        fixedAssets,
      }),
    );
    const bytes = await legacyDatabaseBytes(2);
    const once = await splitLegacyDatabaseIntoPeriods(bytes);
    const again = await splitLegacyDatabaseIntoPeriods(bytes);
    expect(once.periods.map(({ fingerprint }) => fingerprint)).toEqual(
      again.periods.map(({ fingerprint }) => fingerprint),
    );
  });

  it("moves the changes of the previous version into the books, asking only when the app changed the period too", async () => {
    const store = emptyStore();
    const filePath = await legacyDatabaseFile(1);
    const { legacyBook, current } = watchedSetup(filePath);
    await legacyBook.moveInto(store, () => {});
    current.bytes = await changeLegacyDatabase(filePath, async (legacy) =>
      addLegacySale(
        legacy,
        await periodIdNamed(legacy, "2025年分"),
        "前の版で足した売上",
      ),
    );
    const books = await openBooks(store);
    const files = createLocalBookFilesAdapter({
      books,
      legacyUnmovedFiscalPeriods: [],
      legacyMergedFiscalPeriods: [],
      legacyBookWatch: legacyBook,
      userId: USER,
      storage: memoryStorage(),
      now: () => Date.now(),
      fileNameOf: (name) => `${name}.openkk`,
      deliver: async () => "saved",
    });
    await vi.waitFor(() =>
      expect(files.saveTracking.getLegacyBookChanges()).not.toBeNull(),
    );
    const [period] = await books.db.fiscalPeriods.getAll(USER);

    expect(files.saveTracking.legacyChangesOverwritingApp()).toEqual([]);
    await books.db.entries.create(USER, period!.id, {
      date: "2025-08-01",
      description: "アプリで足した売上",
      localId: null,
      businessRate: 1,
      lines: [
        { ...line, side: "debit", bookAccountId: "acct_cash", amount: 700 },
        { ...line, side: "credit", bookAccountId: "acct_sales", amount: 700 },
      ],
    });
    expect(files.saveTracking.legacyChangesOverwritingApp()).toEqual([
      { name: "2025年分", startDate: "2025-01-01", endDate: "2025-12-31" },
    ]);
    await files.saveTracking.moveLegacyBookChanges();

    expect(
      (await books.db.entries.getAll(period!.id)).map(
        ({ description }) => description,
      ),
    ).toEqual(["2025年の売上", "前の版で足した売上"]);
    expect(files.saveTracking.getLegacyBookChanges()).toBeNull();
    expect(await legacyBook.detectChanges()).toBeNull();
  });
});
