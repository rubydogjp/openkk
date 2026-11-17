import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenkkBookFileError,
  type OpenkkBookFileSaveResult,
} from "@rubydogjp/openkk-driver";

import {
  createBooksDbAdapter,
  createMemoryBookStore,
  type BooksDbAdapter,
} from "@rubydogjp/openkk-books-db-adapter";

import {
  BOOK_SAVE_REMINDER_INTERVAL_MS,
  createLocalBookFilesAdapter,
  type LegacyBookChangedPeriod,
  type LegacyBookWatch,
} from "./index.js";

const openAdapters: BooksDbAdapter[] = [];
let nextBookNumber = 1;

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
});

function emptyStore() {
  return createMemoryBookStore(new Map());
}

async function openTestBooks(store: ReturnType<typeof emptyStore>) {
  const adapter = await createBooksDbAdapter({
    store,
    newBookName: () => `book-${nextBookNumber++}.openkk`,
    onFiscalPeriodRemoved: () => {},
    onSaveError: () => {},
  });
  openAdapters.push(adapter);
  return { adapter };
}

const USER = "user-1";
const DAY = 24 * 60 * 60 * 1000;

const period2026 = {
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

const period2027 = {
  name: "2027年分",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
};

const UNMOVED_FROM_PREVIOUS_VERSION = [
  { name: "2024年分", startDate: "2024-01-01", endDate: "2024-12-31" },
];
const MERGED_FROM_PREVIOUS_VERSION = [
  { name: "2023年分", startDate: "2023-01-01", endDate: "2023-12-31" },
];

async function openApp() {
  return openAppWatching(null);
}

async function openAppWatching(legacyBookWatch: LegacyBookWatch | null) {
  const books = await openTestBooks(emptyStore());
  const values = new Map<string, string>();
  const delivered: Array<{ fileName: string; bytes: Uint8Array }> = [];
  const state = {
    now: Date.parse("2026-11-11T00:00:00.000Z"),
    deliveryResult: "saved" as OpenkkBookFileSaveResult,
  };
  const files = createLocalBookFilesAdapter({
    books: books.adapter,
    legacyUnmovedFiscalPeriods: UNMOVED_FROM_PREVIOUS_VERSION,
    legacyMergedFiscalPeriods: MERGED_FROM_PREVIOUS_VERSION,
    legacyBookWatch,
    userId: USER,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
    now: () => state.now,
    fileNameOf: (name) => `${name}.openkk`,
    deliver: async (bytes, fileName) => {
      if (state.deliveryResult === "saved") delivered.push({ fileName, bytes });
      return state.deliveryResult;
    },
  });
  return { books, files, values, delivered, state, db: books.adapter.db };
}

function cases(plan: { items: ReadonlyArray<{ case: string }> }): string[] {
  return plan.items.map((item) => item.case);
}

describe("book files adapter: save", () => {
  it("passes on the periods that could not be moved from the previous version", async () => {
    const app = await openApp();

    expect(app.files.saveTracking.legacyUnmovedFiscalPeriods).toEqual(
      UNMOVED_FROM_PREVIOUS_VERSION,
    );
  });

  it("passes on the periods that were merged into another of the same dates while moving from the previous version", async () => {
    const app = await openApp();

    expect(app.files.saveTracking.legacyMergedFiscalPeriods).toEqual(
      MERGED_FROM_PREVIOUS_VERSION,
    );
  });

  it("names the periods of the books it could not read", async () => {
    const readable = await openApp();
    const period = await readable.books.adapter.db.fiscalPeriods.create(
      USER,
      period2026,
    );
    const bookBytes = (await readable.books.adapter.exportBook(period.id))!
      .bytes;
    const books = await openTestBooks(
      createMemoryBookStore(
        new Map([
          ["a.openkk", bookBytes],
          ["b.openkk", bookBytes],
          ["c.openkk", new TextEncoder().encode("not a database at all")],
        ]),
      ),
    );

    const files = createLocalBookFilesAdapter({
      books: books.adapter,
      legacyUnmovedFiscalPeriods: [],
      legacyMergedFiscalPeriods: [],
      legacyBookWatch: null,
      userId: USER,
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      now: () => 0,
      fileNameOf: (name) => name,
      deliver: async () => "saved",
    });

    expect(files.saveTracking.unreadableFiscalPeriods).toEqual([
      period2026,
      { name: null, startDate: null, endDate: null },
    ]);
  });

  it("counts an import as done but tells that not every book is stored when storing fails afterwards", async () => {
    const app = await openApp();
    const period = await app.books.adapter.db.fiscalPeriods.create(
      USER,
      period2026,
    );
    await app.files.save(period.id);
    await app.books.adapter.db.fiscalPeriods.patch(period.id, {
      name: "保存のあとに変えた",
    });
    const files = createLocalBookFilesAdapter({
      books: {
        ...app.books.adapter,
        flush: async () => {
          throw new Error("no space left");
        },
      },
      legacyUnmovedFiscalPeriods: [],
      legacyMergedFiscalPeriods: [],
      legacyBookWatch: null,
      userId: USER,
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      now: () => app.state.now,
      fileNameOf: (name) => name,
      deliver: async () => "saved",
    });

    const imported = await (
      await files.inspect(app.delivered[0]!.bytes)
    ).apply();

    expect(imported).toEqual({
      fiscalPeriodIds: [period.id],
      allBooksStored: false,
    });
    expect(
      (await app.books.adapter.db.fiscalPeriods.getById(period.id))?.name,
    ).toBe("2026年分");
  });

  it("shows a period that was never saved as having unsaved changes", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);

    expect(app.files.saveTracking.getState(period)).toEqual({
      fileName: "2026年分.openkk",
      hasUnsavedChanges: true,
      lastSavedAt: null,
      reminderDue: false,
    });
    expect(
      app.files.saveTracking.getState({
        id: "missing",
        name: "",
        createdAt: "",
      }),
    ).toBeNull();
  });

  it("saves the book under the period name and remembers the save", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    const notified: number[] = [];
    app.files.saveTracking.subscribe(() => notified.push(1));

    const result = await app.files.save(period.id);

    expect(result).toBe("saved");
    expect(app.delivered.map(({ fileName }) => fileName)).toEqual([
      "2026年分.openkk",
    ]);
    expect(app.files.saveTracking.getState(period)).toEqual({
      fileName: "2026年分.openkk",
      hasUnsavedChanges: false,
      lastSavedAt: app.state.now,
      reminderDue: false,
    });
    expect(notified.length).toBeGreaterThan(0);
  });

  it("keeps the state unsaved when the share sheet is cancelled", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    app.state.deliveryResult = "cancelled";

    expect(await app.files.save(period.id)).toBe("cancelled");
    expect(app.files.saveTracking.getState(period)?.hasUnsavedChanges).toBe(
      true,
    );
    expect(app.files.saveTracking.getState(period)?.lastSavedAt).toBeNull();
  });

  it("shows unsaved changes again after the book changes", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);
    const savedAt = app.state.now;

    const renamed = await app.db.fiscalPeriods.patch(period.id, {
      name: "2026年",
    });

    expect(app.files.saveTracking.getState(renamed)).toEqual({
      fileName: "2026年.openkk",
      hasUnsavedChanges: true,
      lastSavedAt: savedAt,
      reminderDue: false,
    });
  });

  it("returns the same state object until something changes", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);

    const first = app.files.saveTracking.getState(period);
    const second = app.files.saveTracking.getState(period);
    await app.files.save(period.id);

    expect(second).toBe(first);
    expect(app.files.saveTracking.getState(period)).not.toBe(first);
  });

  it("reminds after 30 days only while there are unsaved changes", async () => {
    const app = await openApp();
    const created = await app.db.fiscalPeriods.create(USER, period2026);
    const period = {
      ...created,
      createdAt: new Date(app.state.now).toISOString(),
    };

    app.state.now += BOOK_SAVE_REMINDER_INTERVAL_MS - 1;
    const beforeDue = app.files.saveTracking.getState(period)?.reminderDue;
    app.state.now += 1;
    const neverSavedDue = app.files.saveTracking.getState(period)?.reminderDue;
    await app.files.save(period.id);
    app.state.now += 40 * DAY;
    const savedAndUnchanged =
      app.files.saveTracking.getState(period)?.reminderDue;
    await app.db.fiscalPeriods.patch(period.id, { name: "2026年" });
    const changedLongAfterSave =
      app.files.saveTracking.getState(period)?.reminderDue;
    await app.files.save(period.id);
    await app.db.fiscalPeriods.patch(period.id, { name: "2026年分" });
    const changedRightAfterSave =
      app.files.saveTracking.getState(period)?.reminderDue;

    expect(beforeDue).toBe(false);
    expect(neverSavedDue).toBe(true);
    expect(savedAndUnchanged).toBe(false);
    expect(changedLongAfterSave).toBe(true);
    expect(changedRightAfterSave).toBe(false);
  });
});

describe("book files adapter: import", () => {
  it("does nothing for the file that was just saved", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);

    const plan = await app.files.inspect(app.delivered[0]!.bytes);

    expect(cases(plan)).toEqual(["same"]);
    expect(await plan.apply()).toEqual({
      fiscalPeriodIds: [],
      allBooksStored: true,
    });
  });

  it("tells that app changes will be lost and restores the saved file", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);
    await app.db.fiscalPeriods.patch(period.id, { name: "あとで変えた" });

    const plan = await app.files.inspect(app.delivered[0]!.bytes);
    const imported = await plan.apply();
    const restored = await app.db.fiscalPeriods.getById(period.id);

    expect(cases(plan)).toEqual(["replaces_app_changes"]);
    expect(plan.items[0]).toMatchObject({
      fiscalPeriodName: "2026年分",
      existingFiscalPeriodId: period.id,
      existingFiscalPeriodName: "あとで変えた",
    });
    expect(imported).toEqual({
      fiscalPeriodIds: [period.id],
      allBooksStored: true,
    });
    expect(restored?.name).toBe("2026年分");
    expect(app.files.saveTracking.getState(restored!)?.hasUnsavedChanges).toBe(
      false,
    );
    expect(cases(await app.files.inspect(app.delivered[0]!.bytes))).toEqual([
      "same",
    ]);
  });

  it("tells apart a file changed outside from changes on both sides", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);
    const outside = await openTestBooks(emptyStore());
    const outsideFiles = createLocalBookFilesAdapter({
      books: outside.adapter,
      legacyUnmovedFiscalPeriods: [],
      legacyMergedFiscalPeriods: [],
      legacyBookWatch: null,
      userId: USER,
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      now: () => app.state.now,
      fileNameOf: (name) => name,
      deliver: async () => "saved",
    });
    await (await outsideFiles.inspect(app.delivered[0]!.bytes)).apply();
    await outside.adapter.db.fiscalPeriods.patch(period.id, {
      name: "外で変えた",
    });
    const changedOutside = (await outside.adapter.exportBook(period.id))!.bytes;

    const onlyOutside = await app.files.inspect(changedOutside);
    await app.db.fiscalPeriods.patch(period.id, { name: "中で変えた" });
    const both = await app.files.inspect(changedOutside);
    await both.apply();

    expect(cases(onlyOutside)).toEqual(["changed_outside"]);
    expect(cases(both)).toEqual(["changed_both"]);
    expect((await app.db.fiscalPeriods.getById(period.id))?.name).toBe(
      "外で変えた",
    );
  });

  it("adds a new period without touching the others", async () => {
    const elsewhere = await openApp();
    const other = await elsewhere.db.fiscalPeriods.create(USER, period2027);
    await elsewhere.files.save(other.id);
    const app = await openApp();
    const mine = await app.db.fiscalPeriods.create(USER, period2026);

    const plan = await app.files.inspect(elsewhere.delivered[0]!.bytes);
    const imported = await plan.apply();

    expect(cases(plan)).toEqual(["new"]);
    expect(plan.items[0]?.existingFiscalPeriodId).toBeNull();
    expect(imported).toEqual({
      fiscalPeriodIds: [other.id],
      allBooksStored: true,
    });
    expect(
      (await app.db.fiscalPeriods.getAll(USER)).map(({ id }) => id).sort(),
    ).toEqual([mine.id, other.id].sort());
    expect(app.files.saveTracking.getState(other)?.hasUnsavedChanges).toBe(
      false,
    );
  });

  it("replaces a separately made book of the same dates and forgets nothing it should keep", async () => {
    const elsewhere = await openApp();
    const other = await elsewhere.db.fiscalPeriods.create(USER, period2026);
    await elsewhere.files.save(other.id);
    const app = await openApp();
    const mine = await app.db.fiscalPeriods.create(USER, period2026);

    const plan = await app.files.inspect(elsewhere.delivered[0]!.bytes);
    await plan.apply();

    expect(cases(plan)).toEqual(["same_dates"]);
    expect(plan.items[0]).toMatchObject({
      existingFiscalPeriodId: mine.id,
      existingFiscalPeriodName: "2026年分",
    });
    expect(
      (await app.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([other.id]);
  });

  it("refuses a book that overlaps a period without matching its dates", async () => {
    const elsewhere = await openApp();
    const other = await elsewhere.db.fiscalPeriods.create(USER, {
      name: "2026年度",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    await elsewhere.files.save(other.id);
    const app = await openApp();
    await app.db.fiscalPeriods.create(USER, period2026);

    const plan = await app.files.inspect(elsewhere.delivered[0]!.bytes);

    expect(cases(plan)).toEqual(["overlapping"]);
    expect(plan.items[0]?.existingFiscalPeriodName).toBe("2026年分");
    await expect(plan.apply()).rejects.toMatchObject({
      problem: "books_changed",
    });
    expect(await app.db.fiscalPeriods.getAll(USER)).toHaveLength(1);
  });

  it("asks to start over when the app changed after the file was inspected", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);
    await app.db.fiscalPeriods.patch(period.id, { name: "一度目" });
    const plan = await app.files.inspect(app.delivered[0]!.bytes);

    await app.db.fiscalPeriods.patch(period.id, { name: "二度目" });

    await expect(plan.apply()).rejects.toMatchObject({
      problem: "books_changed",
    });
    expect((await app.db.fiscalPeriods.getById(period.id))?.name).toBe(
      "二度目",
    );
  });

  it("explains files that are not books", async () => {
    const app = await openApp();

    await expect(
      app.files.inspect(new TextEncoder().encode("hello, not a database")),
    ).rejects.toMatchObject({ problem: "not_a_book" });
    await expect(
      app.files.inspect(new TextEncoder().encode("hello, not a database")),
    ).rejects.toBeInstanceOf(OpenkkBookFileError);
  });

  it("explains a book that holds no period of this user", async () => {
    const elsewhere = await openTestBooks(emptyStore());
    const foreign = await elsewhere.adapter.db.fiscalPeriods.create(
      "someone-else",
      period2026,
    );
    const bytes = (await elsewhere.adapter.exportBook(foreign.id))!.bytes;
    const app = await openApp();

    await expect(app.files.inspect(bytes)).rejects.toMatchObject({
      problem: "no_fiscal_period",
    });
  });

  it("forgets the save of a removed period", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);

    app.files.forgetFiscalPeriod(period.id);

    expect([...app.values.keys()]).toEqual([]);
  });
});

function watchReturning(changed: LegacyBookChangedPeriod[]) {
  const accepted: Array<ReadonlyMap<string, number>> = [];
  let resolveChanges: (changes: LegacyBookChangedPeriod[]) => void = () => {};
  const changes = new Promise<LegacyBookChangedPeriod[]>((resolve) => {
    resolveChanges = resolve;
  });
  const watch: LegacyBookWatch = {
    detectChanges: async () => ({
      changed: await changes,
      removed: [
        { name: "2022年分", startDate: "2022-01-01", endDate: "2022-12-31" },
      ],
      accept: (movedLastChangedAt) => {
        accepted.push(movedLastChangedAt);
      },
    }),
  };
  return { watch, accepted, release: () => resolveChanges(changed) };
}

async function previousVersionBytes(
  app: Awaited<ReturnType<typeof openApp>>,
  fiscalPeriodId: string,
  name: string,
): Promise<Uint8Array> {
  const previous = await openApp();
  await (
    await previous.files.inspect(
      (await app.books.adapter.exportBook(fiscalPeriodId))!.bytes,
    )
  ).apply();
  await previous.db.fiscalPeriods.patch(fiscalPeriodId, { name });
  return (await previous.books.adapter.exportBook(fiscalPeriodId))!.bytes;
}

describe("book files adapter: changes made in the previous version", () => {
  it("passes on nothing until the previous version has been checked", async () => {
    const pending = watchReturning([]);
    const app = await openAppWatching(pending.watch);

    expect(app.files.saveTracking.getLegacyBookChanges()).toBeNull();
    pending.release();
    await vi.waitFor(() =>
      expect(app.files.saveTracking.getLegacyBookChanges()).toEqual({
        changedFiscalPeriods: [],
        removedFiscalPeriods: [
          { name: "2022年分", startDate: "2022-01-01", endDate: "2022-12-31" },
        ],
      }),
    );
  });

  it("moves a period changed only in the previous version and remembers the book it made", async () => {
    const seed = await openApp();
    const period = await seed.db.fiscalPeriods.create(USER, period2026);
    const movedBytes = (await seed.books.adapter.exportBook(period.id))!.bytes;
    const changedBytes = await previousVersionBytes(
      seed,
      period.id,
      "前の版で変えた",
    );
    const movedLastChangedAt = seed.books.adapter.lastChangedAt(period.id);
    const label = { ...period2026, name: "前の版で変えた" };
    const { watch, accepted, release } = watchReturning([
      {
        fiscalPeriodId: period.id,
        label,
        bytes: changedBytes,
        movedLastChangedAt,
      },
    ]);
    const watched = await openAppWatching(watch);
    await (await watched.files.inspect(movedBytes)).apply();
    const stampInApp = watched.books.adapter.lastChangedAt(period.id);
    release();
    await vi.waitFor(() =>
      expect(
        watched.files.saveTracking.getLegacyBookChanges()?.changedFiscalPeriods,
      ).toEqual([label]),
    );

    expect(stampInApp).toBe(movedLastChangedAt);
    expect(watched.files.saveTracking.legacyChangesOverwritingApp()).toEqual(
      [],
    );
    const moved = await watched.files.saveTracking.moveLegacyBookChanges();

    expect(moved).toEqual({
      fiscalPeriodIds: [period.id],
      allBooksStored: true,
    });
    expect((await watched.db.fiscalPeriods.getById(period.id))?.name).toBe(
      "前の版で変えた",
    );
    expect(accepted).toEqual([
      new Map([[period.id, watched.books.adapter.lastChangedAt(period.id)]]),
    ]);
    expect(watched.files.saveTracking.getLegacyBookChanges()).toBeNull();
  });

  it("names the periods whose changes in the app the move would overwrite", async () => {
    const seed = await openApp();
    const period = await seed.db.fiscalPeriods.create(USER, period2026);
    const movedBytes = (await seed.books.adapter.exportBook(period.id))!.bytes;
    const changedBytes = await previousVersionBytes(
      seed,
      period.id,
      "前の版で変えた",
    );
    const label = { ...period2026, name: "前の版で変えた" };
    const { watch, release } = watchReturning([
      {
        fiscalPeriodId: period.id,
        label,
        bytes: changedBytes,
        movedLastChangedAt: null,
      },
    ]);
    const app = await openAppWatching(watch);
    await (await app.files.inspect(movedBytes)).apply();
    release();
    await vi.waitFor(() =>
      expect(app.files.saveTracking.getLegacyBookChanges()).not.toBeNull(),
    );

    expect(app.files.saveTracking.legacyChangesOverwritingApp()).toEqual([
      label,
    ]);
    await app.files.saveTracking.moveLegacyBookChanges();
    expect((await app.db.fiscalPeriods.getById(period.id))?.name).toBe(
      "前の版で変えた",
    );
  });

  it("adds a period that only the previous version has", async () => {
    const elsewhere = await openApp();
    const other = await elsewhere.db.fiscalPeriods.create(USER, period2027);
    const bytes = (await elsewhere.books.adapter.exportBook(other.id))!.bytes;
    const { watch, accepted, release } = watchReturning([
      {
        fiscalPeriodId: other.id,
        label: period2027,
        bytes,
        movedLastChangedAt: null,
      },
    ]);
    const app = await openAppWatching(watch);
    release();
    await vi.waitFor(() =>
      expect(app.files.saveTracking.getLegacyBookChanges()).not.toBeNull(),
    );

    expect(app.files.saveTracking.legacyChangesOverwritingApp()).toEqual([]);
    await app.files.saveTracking.moveLegacyBookChanges();

    expect(
      (await app.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([other.id]);
    expect(app.files.saveTracking.getState(other)?.hasUnsavedChanges).toBe(
      true,
    );
    expect(accepted).toHaveLength(1);
  });

  it("keeps the changes and remembers nothing when a period cannot be moved", async () => {
    const elsewhere = await openApp();
    const other = await elsewhere.db.fiscalPeriods.create(USER, period2026);
    const bytes = (await elsewhere.books.adapter.exportBook(other.id))!.bytes;
    const { watch, accepted, release } = watchReturning([
      {
        fiscalPeriodId: other.id,
        label: period2026,
        bytes,
        movedLastChangedAt: null,
      },
    ]);
    const app = await openAppWatching(watch);
    const mine = await app.db.fiscalPeriods.create(USER, period2026);
    release();
    await vi.waitFor(() =>
      expect(app.files.saveTracking.getLegacyBookChanges()).not.toBeNull(),
    );

    await expect(
      app.files.saveTracking.moveLegacyBookChanges(),
    ).rejects.toMatchObject({ problem: "books_changed" });
    expect(accepted).toEqual([]);
    expect(app.files.saveTracking.getLegacyBookChanges()).not.toBeNull();
    expect(
      (await app.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([mine.id]);
  });

  it("tells nothing when the previous version cannot be checked", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = await openAppWatching({
      detectChanges: async () => {
        throw new Error("the previous version could not be read");
      },
    });
    await vi.waitFor(() => expect(logged).toHaveBeenCalled());

    expect(app.files.saveTracking.getLegacyBookChanges()).toBeNull();
    logged.mockRestore();
  });
});
