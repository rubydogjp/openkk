import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBooksDbAdapter,
  createMemoryBookStore,
  readStoredFiscalPeriodIds,
  splitBookFile,
  type BooksDbAdapter,
  type BookStore,
} from "@rubydogjp/openkk-books-db-adapter";

import { createNodeSqliteDbAdapter } from "../../node-sqlite-db-adapter/src/index.js";
import {
  createLegacyBook,
  type LegacyBookDependencies,
} from "../app/legacy-book";

const USER = "openkk-original-user";
const tempDirs: string[] = [];
const openAdapters: BooksDbAdapter[] = [];

afterEach(() => {
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

async function legacyDatabaseBytes(periodCount: number): Promise<Uint8Array> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-legacy-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "openkk.sqlite3");
  const legacy = await createNodeSqliteDbAdapter(filePath, null);
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
  return new Uint8Array(fs.readFileSync(filePath));
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
    exportLegacyDatabase: vi.fn(async () => legacyBytes),
    splitIntoPeriods: async (bytes) =>
      (await splitBookFile(bytes)).map((period) => ({
        fiscalPeriodId: period.fiscalPeriod.id,
        bytes: period.bytes,
      })),
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

    const moved = await legacyBook.moveInto(store, () => {});
    const books = await openBooks(store);
    const periods = await books.db.fiscalPeriods.getAll(USER);

    expect(moved).toHaveLength(2);
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

    expect(again).toEqual([]);
    expect(dependencies.exportLegacyDatabase).toHaveBeenCalledTimes(1);
    expect(await store.list()).toHaveLength(1);
  });

  it("marks the move as done when there is no previous version", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(null, {});

    expect(await legacyBook.moveInto(store, () => {})).toEqual([]);
    expect(state.moved).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it("marks the move as done when the previous version holds no fiscal period", async () => {
    const store = emptyStore();
    const { legacyBook, state } = setup(await legacyDatabaseBytes(0), {});

    expect(await legacyBook.moveInto(store, () => {})).toEqual([]);
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
    expect(resumed).toHaveLength(2);
    expect(state.moved).toBe(true);
    expect(await inner.list()).toHaveLength(3);
    expect(await books.db.fiscalPeriods.getAll(USER)).toHaveLength(3);
    expect(books.unreadableBooks).toEqual([]);
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
