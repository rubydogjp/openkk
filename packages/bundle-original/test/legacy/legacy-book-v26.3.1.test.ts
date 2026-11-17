import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBooksDbAdapter,
  createMemoryBookStore,
  readStoredFiscalPeriodIds,
  type BooksDbAdapter,
} from "@rubydogjp/openkk-books-db-adapter";

import {
  createLegacyBook,
  createLegacyBookWatchRecordStore,
  createLegacyMergedFiscalPeriodsRecord,
  createLegacyUnmovedFiscalPeriodsRecord,
  splitLegacyDatabaseIntoPeriods,
} from "../../app/legacy/legacy-book";
import { fingerprintBytes } from "../../app/legacy/legacy-fingerprint";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../test/legacy-fixtures/v26.3.1",
);

type StoredRecord = Record<string, unknown> & { id: string };

type ReleasePeriodRecords = {
  fiscalPeriod: StoredRecord & { archiveStatus: string };
  entries: Array<StoredRecord & { date: string; createdAt: string }>;
  fixedAssets: Array<StoredRecord & { createdAt: string }>;
  entryIdsInStoredOrder: string[];
  fixedAssetIdsInStoredOrder: string[];
};

type ReleaseFixture = {
  madeBy: string;
  userId: string;
  schemaVersion: string;
  database: ReleasePeriodRecords[];
};

const fixture = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, "expected.json"), "utf8"),
) as ReleaseFixture;
const legacyBytes = new Uint8Array(
  fs.readFileSync(path.join(FIXTURE_DIR, "openkk.sqlite3")),
);

const importedCopy = fixture.database.find(
  (period) =>
    period.fiscalPeriod.startDate === "2023-01-01" &&
    period.fiscalPeriod.archiveStatus === "active",
)!;
const archivedOriginal = fixture.database.find(
  (period) => period.fiscalPeriod.archiveStatus === "archived",
)!;
const SAME_DATES_2023 = {
  name: "2023年分",
  startDate: "2023-01-01",
  endDate: "2023-12-31",
};

const openAdapters: BooksDbAdapter[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function memoryStorage() {
  const items = new Map<string, string>();
  const state = { works: true };
  return {
    state,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (state.works) items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

function readAsCurrentVersion(
  fiscalPeriod: ReleasePeriodRecords["fiscalPeriod"],
): StoredRecord {
  const withMasterSet = { ...fiscalPeriod, masterSetId: "jp-2026" };
  return withMasterSet.archiveStatus === "archived"
    ? { ...withMasterSet, archiveStatus: "active", archivedAt: null }
    : withMasterSet;
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function inStoredOrder<Item extends { id: string }>(
  items: readonly Item[],
  storedOrder: readonly string[],
  keyOf: (item: Item) => string,
): string[] {
  return [...items]
    .sort(
      (left, right) =>
        keyOf(left).localeCompare(keyOf(right)) ||
        storedOrder.indexOf(left.id) - storedOrder.indexOf(right.id),
    )
    .map((item) => item.id);
}

function withDifferentCopy(): Uint8Array {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-v26.3.1-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "openkk.sqlite3");
  fs.writeFileSync(filePath, legacyBytes);
  const database = new DatabaseSync(filePath);
  try {
    database
      .prepare(
        "UPDATE entry_lines SET amount = amount + 1 WHERE entry_id IN (SELECT id FROM entries WHERE fiscal_period_id = ? AND description = ?)",
      )
      .run(importedCopy.fiscalPeriod.id, "制作の売上 (3 月分)");
  } finally {
    database.close();
  }
  return new Uint8Array(fs.readFileSync(filePath));
}

function prepareMove(
  bytes: Uint8Array,
  mergedStorage: ReturnType<typeof memoryStorage>,
) {
  const store = createMemoryBookStore(new Map());
  let moved = false;
  let nextBook = 1;
  const legacyBook = createLegacyBook({
    marker: {
      isMoved: async () => moved,
      markMoved: async () => {
        moved = true;
      },
    },
    unmovedFiscalPeriodsRecord:
      createLegacyUnmovedFiscalPeriodsRecord(memoryStorage()),
    mergedFiscalPeriodsRecord:
      createLegacyMergedFiscalPeriodsRecord(mergedStorage),
    watchRecord: createLegacyBookWatchRecordStore(memoryStorage()),
    fingerprintDatabase: fingerprintBytes,
    exportLegacyDatabase: async () => bytes,
    splitIntoPeriods: splitLegacyDatabaseIntoPeriods,
    storedFiscalPeriodIds: readStoredFiscalPeriodIds,
    newBookName: () => `moved-${nextBook++}.openkk`,
  });
  return { store, legacyBook, moved: () => moved };
}

async function moveReleaseDatabase(bytes: Uint8Array) {
  const move = prepareMove(bytes, memoryStorage());
  const result = await move.legacyBook.moveInto(move.store, () => {});
  return { ...move, result };
}

async function openMovedBooks(store: ReturnType<typeof createMemoryBookStore>) {
  const books = await createBooksDbAdapter({
    store,
    newBookName: () => "new.openkk",
    onFiscalPeriodRemoved: () => {},
    onSaveError: () => {},
  });
  openAdapters.push(books);
  return books;
}

describe(`a database written by ${fixture.madeBy}`, () => {
  it("is the schema version the release wrote", () => {
    expect(fixture.schemaVersion).toBe("5");
    expect(fixture.database.map((period) => period.fiscalPeriod.phase)).toEqual(
      expect.arrayContaining(["pre_opening", "journalizing", "post_closing"]),
    );
    expect(
      fixture.database.map((period) => period.fiscalPeriod.archiveStatus),
    ).toEqual(expect.arrayContaining(["active", "archived", "purged"]));
  });

  it("moves every fiscal period into a book of its own and reads back each record as the release stored it, as the first version of accounts and categories", async () => {
    const { result, store, moved } = await moveReleaseDatabase(legacyBytes);
    const books = await openMovedBooks(store);
    const movedPeriods = fixture.database.filter(
      (period) => period !== importedCopy,
    );

    expect(result.unmovedFiscalPeriods).toEqual([]);
    expect(result.mergedFiscalPeriods).toEqual([SAME_DATES_2023]);
    expect(moved()).toBe(true);
    expect(books.unreadableBooks).toEqual([]);
    expect(await store.list()).toHaveLength(movedPeriods.length);
    expect([...result.movedFiscalPeriodIds].sort()).toEqual(
      movedPeriods.map((period) => period.fiscalPeriod.id).sort(),
    );

    const current = await books.db.fiscalPeriods.getAll(fixture.userId);
    expect([...current].sort(byId)).toEqual(
      movedPeriods
        .map((period) => readAsCurrentVersion(period.fiscalPeriod))
        .sort(byId),
    );

    for (const period of movedPeriods) {
      if (period.fiscalPeriod.archiveStatus === "purged") continue;
      const entries = await books.db.entries.getAll(period.fiscalPeriod.id);
      const fixedAssets = await books.db.fixedAssets.getAll(
        period.fiscalPeriod.id,
      );
      expect([...entries].sort(byId)).toEqual([...period.entries].sort(byId));
      expect([...fixedAssets].sort(byId)).toEqual(
        [...period.fixedAssets].sort(byId),
      );
      expect(entries.map(({ id }) => id)).toEqual(
        inStoredOrder(
          period.entries,
          period.entryIdsInStoredOrder,
          (entry) => `${entry.date} ${entry.createdAt}`,
        ),
      );
      expect(fixedAssets.map(({ id }) => id)).toEqual(
        inStoredOrder(
          period.fixedAssets,
          period.fixedAssetIdsInStoredOrder,
          (asset) => asset.createdAt,
        ),
      );
    }
  });

  it("keeps the archived original of the period whose archive was imported back, and merges the copy", async () => {
    const { result, store } = await moveReleaseDatabase(legacyBytes);
    const books = await openMovedBooks(store);

    const sameDates = (await books.db.fiscalPeriods.getAll(fixture.userId))
      .filter((period) => period.startDate === "2023-01-01")
      .map(({ id, archiveStatus }) => ({ id, archiveStatus }));

    expect(sameDates).toEqual([
      { id: archivedOriginal.fiscalPeriod.id, archiveStatus: "active" },
    ]);
    expect(result.movedFiscalPeriodIds).not.toContain(
      importedCopy.fiscalPeriod.id,
    );
  });

  it("moves both periods of the same dates when their contents differ", async () => {
    const { result, store } = await moveReleaseDatabase(withDifferentCopy());
    const books = await openMovedBooks(store);

    expect(result.mergedFiscalPeriods).toEqual([]);
    expect(
      (await books.db.fiscalPeriods.getAll(fixture.userId))
        .filter((period) => period.startDate === "2023-01-01")
        .map(({ id }) => id)
        .sort(),
    ).toEqual(
      [archivedOriginal.fiscalPeriod.id, importedCopy.fiscalPeriod.id].sort(),
    );
    expect(await store.list()).toHaveLength(fixture.database.length);
  });

  it("does not mark the move when the merged periods cannot be remembered, and moves nothing twice next time", async () => {
    const mergedStorage = memoryStorage();
    mergedStorage.state.works = false;
    const { legacyBook, store, moved } = prepareMove(
      legacyBytes,
      mergedStorage,
    );

    await expect(legacyBook.moveInto(store, () => {})).rejects.toThrow(
      /merged into another of the same dates was not stored/,
    );
    const movedAfterFailure = moved();
    const storedAfterFailure = (await store.list()).length;
    mergedStorage.state.works = true;
    const resumed = await legacyBook.moveInto(store, () => {});

    expect(movedAfterFailure).toBe(false);
    expect(storedAfterFailure).toBe(fixture.database.length - 1);
    expect(resumed.movedFiscalPeriodIds).toEqual([]);
    expect(resumed.mergedFiscalPeriods).toEqual([SAME_DATES_2023]);
    expect(moved()).toBe(true);
    expect(await store.list()).toHaveLength(fixture.database.length - 1);
  });

  it("leaves the database of the release untouched", async () => {
    const before = new Uint8Array(legacyBytes);

    await moveReleaseDatabase(legacyBytes);

    expect(legacyBytes).toEqual(before);
  });
});
