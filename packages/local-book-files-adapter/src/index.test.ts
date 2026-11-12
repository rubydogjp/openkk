import { afterEach, describe, expect, it } from "vitest";

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
  createBookFilesAdapter,
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

async function openApp() {
  const books = await openTestBooks(emptyStore());
  const values = new Map<string, string>();
  const delivered: Array<{ fileName: string; bytes: Uint8Array }> = [];
  const state = {
    now: Date.parse("2026-11-11T00:00:00.000Z"),
    deliveryResult: "saved" as OpenkkBookFileSaveResult,
  };
  const files = createBookFilesAdapter({
    books: books.adapter,
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
  it("shows a period that was never saved as having unsaved changes", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);

    expect(app.files.getState(period)).toEqual({
      fileName: "2026年分.openkk",
      hasUnsavedChanges: true,
      lastSavedAt: null,
      reminderDue: false,
    });
    expect(
      app.files.getState({ id: "missing", name: "", createdAt: "" }),
    ).toBeNull();
  });

  it("saves the book under the period name and remembers the save", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    const notified: number[] = [];
    app.files.subscribe(() => notified.push(1));

    const result = await app.files.save(period.id);

    expect(result).toBe("saved");
    expect(app.delivered.map(({ fileName }) => fileName)).toEqual([
      "2026年分.openkk",
    ]);
    expect(app.files.getState(period)).toEqual({
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
    expect(app.files.getState(period)?.hasUnsavedChanges).toBe(true);
    expect(app.files.getState(period)?.lastSavedAt).toBeNull();
  });

  it("shows unsaved changes again after the book changes", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);
    const savedAt = app.state.now;

    const renamed = await app.db.fiscalPeriods.patch(period.id, {
      name: "2026年",
    });

    expect(app.files.getState(renamed)).toEqual({
      fileName: "2026年.openkk",
      hasUnsavedChanges: true,
      lastSavedAt: savedAt,
      reminderDue: false,
    });
  });

  it("returns the same state object until something changes", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);

    const first = app.files.getState(period);
    const second = app.files.getState(period);
    await app.files.save(period.id);

    expect(second).toBe(first);
    expect(app.files.getState(period)).not.toBe(first);
  });

  it("reminds after 30 days only while there are unsaved changes", async () => {
    const app = await openApp();
    const created = await app.db.fiscalPeriods.create(USER, period2026);
    const period = {
      ...created,
      createdAt: new Date(app.state.now).toISOString(),
    };

    app.state.now += BOOK_SAVE_REMINDER_INTERVAL_MS - 1;
    const beforeDue = app.files.getState(period)?.reminderDue;
    app.state.now += 1;
    const neverSavedDue = app.files.getState(period)?.reminderDue;
    await app.files.save(period.id);
    app.state.now += 40 * DAY;
    const savedAndUnchanged = app.files.getState(period)?.reminderDue;
    await app.db.fiscalPeriods.patch(period.id, { name: "2026年" });
    const changedLongAfterSave = app.files.getState(period)?.reminderDue;
    await app.files.save(period.id);
    await app.db.fiscalPeriods.patch(period.id, { name: "2026年分" });
    const changedRightAfterSave = app.files.getState(period)?.reminderDue;

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
    expect(await plan.apply()).toEqual([]);
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
    expect(imported).toEqual([period.id]);
    expect(restored?.name).toBe("2026年分");
    expect(app.files.getState(restored!)?.hasUnsavedChanges).toBe(false);
    expect(cases(await app.files.inspect(app.delivered[0]!.bytes))).toEqual([
      "same",
    ]);
  });

  it("tells apart a file changed outside from changes on both sides", async () => {
    const app = await openApp();
    const period = await app.db.fiscalPeriods.create(USER, period2026);
    await app.files.save(period.id);
    const outside = await openTestBooks(emptyStore());
    const outsideFiles = createBookFilesAdapter({
      books: outside.adapter,
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
    expect(imported).toEqual([other.id]);
    expect(
      (await app.db.fiscalPeriods.getAll(USER)).map(({ id }) => id).sort(),
    ).toEqual([mine.id, other.id].sort());
    expect(app.files.getState(other)?.hasUnsavedChanges).toBe(false);
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
