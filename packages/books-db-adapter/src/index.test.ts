import { afterEach, describe, expect, it } from "vitest";

import { createDocumentDbAdapter } from "@rubydogjp/openkk-book-db-adapter";
import type {
  DbSnapshot,
  FiscalPeriodDbRecord,
} from "@rubydogjp/openkk-engine";

import {
  closeTestBooks,
  emptyStore,
  openTestBooks,
  seededBookBytes,
  seededStore,
} from "../test-support/books.js";
import {
  BookImportChangedError,
  createMemoryBookStore,
  splitBookFile,
  type BookImportExpectation,
  type BookStore,
  type InspectedBookPeriod,
} from "./index.js";

afterEach(closeTestBooks);

const USER = "user-1";

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

const line = {
  partnerName: "",
  taxCategoryId: "tax_out_of_scope",
  businessCategoryId: "",
};

function entryInput(description: string, date: string, amount: number) {
  return {
    date,
    description,
    localId: null,
    businessRate: 1,
    lines: [
      { ...line, side: "debit" as const, bookAccountId: "acct_cash", amount },
      { ...line, side: "credit" as const, bookAccountId: "acct_sales", amount },
    ],
  };
}

function seedPeriod(
  id: string,
  range: { name: string; startDate: string; endDate: string },
  userId: string,
): FiscalPeriodDbRecord {
  return {
    id,
    userId,
    ...range,
    phase: "journalizing",
    archiveStatus: "active",
    archivedAt: null,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: { balanceLines: [], journals: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function seedOf(...fiscalPeriods: FiscalPeriodDbRecord[]): DbSnapshot {
  return { fiscalPeriods, entries: [], fixedAssets: [] };
}

function expectationsOf(
  inspected: readonly InspectedBookPeriod[],
): BookImportExpectation[] {
  return inspected.map(({ fiscalPeriod, relation }) => ({
    fiscalPeriodId: fiscalPeriod.id,
    relation: relation.kind,
    existingFiscalPeriodId:
      relation.kind === "same_period" || relation.kind === "same_dates"
        ? relation.existing.id
        : null,
    existingLastChangedAt:
      relation.kind === "same_period" || relation.kind === "same_dates"
        ? relation.existingLastChangedAt
        : null,
  }));
}

async function closedPeriod(
  books: Awaited<ReturnType<typeof openTestBooks>>,
): Promise<FiscalPeriodDbRecord> {
  const { db } = books.adapter;
  const created = await db.fiscalPeriods.create(USER, period2026);
  await db.fiscalPeriods.start(created.id);
  await db.fiscalPeriods.patch(created.id, { openingBalancesCompleted: true });
  await db.entries.create(
    USER,
    created.id,
    entryInput("売上", "2026-06-01", 5000),
  );
  await db.preClosings.run(created.id);
  await db.closings.run(created.id, []);
  return db.fiscalPeriods.patch(created.id, {
    documentsReceivedCompleted: true,
  });
}

describe("books-db-adapter storage", () => {
  it("keeps each fiscal period in its own book and reads them back", async () => {
    const first = await openTestBooks(emptyStore());
    const a = await first.adapter.db.fiscalPeriods.create(USER, period2026);
    const b = await first.adapter.db.fiscalPeriods.create(USER, period2027);
    await first.adapter.db.fiscalPeriods.start(a.id);
    await first.adapter.db.entries.create(
      USER,
      a.id,
      entryInput("売上", "2026-06-01", 1000),
    );
    await first.adapter.flush();

    const names = await first.store.list();
    const reopened = await openTestBooks(first.store);

    expect(names).toHaveLength(2);
    for (const name of names) {
      const bytes = await first.store.read(name);
      const book = await createDocumentDbAdapter(bytes);
      expect(book.listFiscalPeriodIds()).toHaveLength(1);
      book.close();
    }
    expect(
      (await reopened.adapter.db.fiscalPeriods.getAll(USER)).map(
        (period) => period.id,
      ),
    ).toEqual([a.id, b.id]);
    expect(await reopened.adapter.db.entries.getAll(a.id)).toHaveLength(1);
    expect(reopened.adapter.unreadableBooks).toEqual([]);
  });

  it("finds entries and fixed assets by ID in whichever book holds them", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const a = await db.fiscalPeriods.create(USER, period2026);
    const b = await db.fiscalPeriods.create(USER, period2027);
    await db.fiscalPeriods.start(a.id);
    await db.fiscalPeriods.start(b.id);
    const inA = await db.entries.create(
      USER,
      a.id,
      entryInput("A", "2026-06-01", 100),
    );
    const inB = await db.entries.create(
      USER,
      b.id,
      entryInput("B", "2027-06-01", 200),
    );

    await db.entries.update(inB.id, entryInput("B2", "2027-06-02", 300));
    await db.entries.remove(inA.id);

    expect(await db.entries.getAll(a.id)).toEqual([]);
    expect((await db.entries.getById(inB.id))?.description).toBe("B2");
    expect(await db.entries.getById("missing")).toBeNull();
  });

  it("rejects a period that overlaps a period in another book", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    await db.fiscalPeriods.create(USER, period2026);
    const next = await db.fiscalPeriods.create(USER, period2027);

    await expect(
      db.fiscalPeriods.create(USER, {
        name: "重なる",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
      }),
    ).rejects.toThrow(/overlaps active fiscal period/);
    await expect(
      db.fiscalPeriods.patch(next.id, { startDate: "2026-12-01" }),
    ).rejects.toThrow(/overlaps active fiscal period/);
    await expect(
      db.fiscalPeriods.importArchived(USER, {
        fiscalPeriod: {
          ...period2026,
          phase: "post_closing",
          openingBalancesCompleted: true,
          documentsReceivedCompleted: true,
          opening: { balanceLines: [], journals: [] },
        },
        entries: [],
        fixedAssets: [],
      }),
    ).rejects.toThrow(/overlaps active fiscal period/);
    expect(await books.store.list()).toHaveLength(2);
  });

  it("carries a closed period into a new book and into a started period of another book", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const source = await closedPeriod(books);

    const next = await db.fiscalPeriods.createNext(USER, {
      sourceFiscalPeriodId: source.id,
      ...period2027,
      carryBalances: true,
      reversalEntryIds: [],
      carryFixedAssets: true,
    });
    const cash = next.opening.balanceLines.find(
      (balance) => balance.accountId === "a:現金",
    );
    await db.fiscalPeriods.start(next.id);
    const reapplied = await db.fiscalPeriods.applyCarryover(next.id, {
      sourceFiscalPeriodId: source.id,
      carryBalances: true,
      reversalEntryIds: null,
      carryFixedAssets: false,
    });

    expect(await books.store.list()).toHaveLength(2);
    expect(next.openingBalancesCompleted).toBe(true);
    expect(cash?.amount).toBe(5000);
    expect(
      reapplied.opening.balanceLines.map(({ accountId, amount }) => ({
        accountId,
        amount,
      })),
    ).toEqual(
      next.opening.balanceLines.map(({ accountId, amount }) => ({
        accountId,
        amount,
      })),
    );
    await expect(
      db.fiscalPeriods.applyCarryover(next.id, {
        sourceFiscalPeriodId: source.id,
        carryBalances: false,
        reversalEntryIds: ["missing-entry"],
        carryFixedAssets: false,
      }),
    ).rejects.toThrow(/Reversal entry missing-entry not found/);
  });

  it("does not leave a book behind when the next period cannot be created", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const open = await db.fiscalPeriods.create(USER, period2026);

    await expect(
      db.fiscalPeriods.createNext(USER, {
        sourceFiscalPeriodId: open.id,
        ...period2027,
        carryBalances: true,
        reversalEntryIds: [],
        carryFixedAssets: true,
      }),
    ).rejects.toThrow(/Carryover requires closing/);

    expect(await books.store.list()).toHaveLength(1);
    expect(await db.fiscalPeriods.getAll(USER)).toHaveLength(1);
  });

  it("removes the book file when its period is removed", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);

    await db.fiscalPeriods.remove(created.id);

    expect(await books.store.list()).toEqual([]);
    expect(await db.fiscalPeriods.getById(created.id)).toBeNull();
    expect(books.removedFiscalPeriodIds).toEqual([created.id]);
  });

  it("skips a book it cannot read and leaves the file in the store", async () => {
    const good = await seededBookBytes(
      seedOf(seedPeriod("fp-good", period2026, USER)),
    );
    const store = createMemoryBookStore(
      new Map([
        ["a.openkk", new TextEncoder().encode("not a database at all")],
        ["b.openkk", good],
      ]),
    );

    const books = await openTestBooks(store);

    expect(
      (await books.adapter.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual(["fp-good"]);
    expect(books.adapter.unreadableBooks.map(({ name }) => name)).toEqual([
      "a.openkk",
    ]);
    expect(await store.list()).toHaveLength(2);
  });

  it("keeps only the first of two books that hold the same period", async () => {
    const bytes = await seededBookBytes(
      seedOf(seedPeriod("fp-same", period2026, USER)),
    );
    const store = createMemoryBookStore(
      new Map([
        ["a.openkk", bytes],
        ["b.openkk", bytes],
      ]),
    );

    const books = await openTestBooks(store);

    expect(await books.adapter.db.fiscalPeriods.getAll(USER)).toHaveLength(1);
    expect(books.adapter.unreadableBooks.map(({ name }) => name)).toEqual([
      "b.openkk",
    ]);
  });
});

describe("books-db-adapter saving", () => {
  function gatedStore(): {
    store: BookStore;
    writes: string[];
    failNext(): void;
    hold(): () => void;
  } {
    const inner = emptyStore();
    const writes: string[] = [];
    let failing = false;
    let gate: Promise<void> | null = null;
    return {
      writes,
      failNext() {
        failing = true;
      },
      hold() {
        let open: () => void = () => {};
        gate = new Promise<void>((resolve) => {
          open = resolve;
        });
        return () => {
          gate = null;
          open();
        };
      },
      store: {
        list: () => inner.list(),
        read: (name) => inner.read(name),
        remove: (name) => inner.remove(name),
        async write(name, bytes) {
          if (gate != null) await gate;
          if (failing) {
            failing = false;
            throw new Error("disk full");
          }
          writes.push(name);
          await inner.write(name, bytes);
        },
      },
    };
  }

  it("saves a changed book, writing only the latest content while a save is running", async () => {
    const gated = gatedStore();
    const books = await openTestBooks(gated.store);
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    await db.fiscalPeriods.start(created.id);
    await books.adapter.flush();
    gated.writes.length = 0;
    const statuses: string[] = [];
    books.adapter.subscribe(() => statuses.push(books.adapter.storageStatus()));

    const release = gated.hold();
    for (const amount of [100, 200, 300]) {
      await db.entries.create(
        USER,
        created.id,
        entryInput("売上", "2026-06-01", amount),
      );
    }
    expect(books.adapter.storageStatus()).toBe("saving");
    release();
    await books.adapter.flush();

    expect(gated.writes).toHaveLength(2);
    expect(books.adapter.storageStatus()).toBe("saved");
    expect(statuses).toContain("saving");
    const reopened = await openTestBooks(gated.store);
    expect(await reopened.adapter.db.entries.getAll(created.id)).toHaveLength(
      3,
    );
  });

  it("reports a failed save and saves again on the next change", async () => {
    const gated = gatedStore();
    const books = await openTestBooks(gated.store);
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    await books.adapter.flush();

    gated.failNext();
    await db.fiscalPeriods.patch(created.id, { name: "2026年" });
    await expect(books.adapter.flush()).rejects.toThrow(/could not be saved/);
    expect(books.adapter.storageStatus()).toBe("failed");
    expect(books.saveErrors).toHaveLength(1);

    await books.adapter.flush();

    expect(books.adapter.storageStatus()).toBe("saved");
    const reopened = await openTestBooks(gated.store);
    expect(
      (await reopened.adapter.db.fiscalPeriods.getById(created.id))?.name,
    ).toBe("2026年");
  });

  it("removes or replaces a book while its last change is still waiting to be saved", async () => {
    const gated = gatedStore();
    const books = await openTestBooks(gated.store);
    const { db } = books.adapter;
    const removed = await db.fiscalPeriods.create(USER, period2026);
    const replaced = await db.fiscalPeriods.create(USER, period2027);
    const exported = await books.adapter.exportBook(replaced.id);
    const inspected = await books.adapter.inspectBookFile(
      exported!.bytes,
      USER,
    );
    await db.fiscalPeriods.patch(replaced.id, { name: "あとで変えた" });
    const changed = await books.adapter.inspectBookFile(exported!.bytes, USER);
    void inspected;

    await Promise.all([
      db.fiscalPeriods.patch(removed.id, { name: "消す直前に変えた" }),
      db.fiscalPeriods.remove(removed.id),
      db.fiscalPeriods.patch(replaced.id, { name: "置き換える直前に変えた" }),
    ]);
    const racing = await books.adapter.inspectBookFile(exported!.bytes, USER);
    await Promise.all([
      db.fiscalPeriods.patch(replaced.id, { name: "さらに変えた" }),
      books.adapter
        .importBookFile(exported!.bytes, USER, expectationsOf(racing))
        .catch((error: unknown) => error),
    ]);
    const latest = await books.adapter.inspectBookFile(exported!.bytes, USER);
    await books.adapter.importBookFile(
      exported!.bytes,
      USER,
      expectationsOf(latest),
    );
    await books.adapter.flush();

    expect(changed[0]?.relation.kind).toBe("same_period");
    expect(await gated.store.list()).toHaveLength(1);
    expect((await db.fiscalPeriods.getById(replaced.id))?.name).toBe(
      "2027年分",
    );
    const reopened = await openTestBooks(gated.store);
    expect(
      (await reopened.adapter.db.fiscalPeriods.getAll(USER)).map(
        ({ name }) => name,
      ),
    ).toEqual(["2027年分"]);
  });

  it("keeps saving the book when its replacement cannot be written", async () => {
    const gated = gatedStore();
    const books = await openTestBooks(gated.store);
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    const exported = await books.adapter.exportBook(created.id);
    await db.fiscalPeriods.patch(created.id, { name: "あとで変えた" });
    await books.adapter.flush();
    const inspected = await books.adapter.inspectBookFile(
      exported!.bytes,
      USER,
    );

    gated.failNext();
    await expect(
      books.adapter.importBookFile(
        exported!.bytes,
        USER,
        expectationsOf(inspected),
      ),
    ).rejects.toThrow(/disk full/);
    await db.fiscalPeriods.patch(created.id, { name: "失敗のあとで変えた" });
    await books.adapter.flush();

    const reopened = await openTestBooks(gated.store);
    expect(
      (await reopened.adapter.db.fiscalPeriods.getById(created.id))?.name,
    ).toBe("失敗のあとで変えた");
  });

  it("fails the operation and keeps nothing when a new book cannot be written", async () => {
    const gated = gatedStore();
    const books = await openTestBooks(gated.store);

    gated.failNext();
    await expect(
      books.adapter.db.fiscalPeriods.create(USER, period2026),
    ).rejects.toThrow(/disk full/);

    expect(await books.adapter.db.fiscalPeriods.getAll(USER)).toEqual([]);
    expect(await gated.store.list()).toEqual([]);
  });
});

describe("books-db-adapter book files", () => {
  it("exports a period as a book that holds the same stamp and content", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    await db.fiscalPeriods.start(created.id);
    await db.entries.create(
      USER,
      created.id,
      entryInput("売上", "2026-06-01", 1000),
    );

    const exported = await books.adapter.exportBook(created.id);
    const file = await createDocumentDbAdapter(exported?.bytes ?? null);

    expect(exported?.lastChangedAt).toBe(
      books.adapter.lastChangedAt(created.id),
    );
    expect(file.lastChangedAtOnOpen).toBe(exported?.lastChangedAt);
    expect(await file.db.entries.getAll(created.id)).toHaveLength(1);
    expect(await books.adapter.exportBook("missing")).toBeNull();
    file.close();
  });

  it("sees an exported book as the same period with the same stamp until either side changes", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    const exported = await books.adapter.exportBook(created.id);

    const unchanged = await books.adapter.inspectBookFile(
      exported!.bytes,
      USER,
    );
    await db.fiscalPeriods.patch(created.id, { name: "2026年" });
    const changed = await books.adapter.inspectBookFile(exported!.bytes, USER);

    expect(unchanged).toHaveLength(1);
    expect(unchanged[0]?.relation).toMatchObject({
      kind: "same_period",
      existingLastChangedAt: exported!.lastChangedAt,
    });
    expect(unchanged[0]?.lastChangedAt).toBe(exported!.lastChangedAt);
    expect(changed[0]?.lastChangedAt).toBe(exported!.lastChangedAt);
    expect(changed[0]?.relation).toMatchObject({ kind: "same_period" });
    expect(
      changed[0]?.relation.kind === "same_period" &&
        changed[0].relation.existingLastChangedAt > exported!.lastChangedAt,
    ).toBe(true);
  });

  it("restores a book from a file, replacing what was changed after the file was saved", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    await db.fiscalPeriods.start(created.id);
    const exported = await books.adapter.exportBook(created.id);
    await db.entries.create(
      USER,
      created.id,
      entryInput("あとで足した", "2026-06-01", 1000),
    );

    const inspected = await books.adapter.inspectBookFile(
      exported!.bytes,
      USER,
    );
    const imported = await books.adapter.importBookFile(
      exported!.bytes,
      USER,
      expectationsOf(inspected),
    );
    await books.adapter.flush();

    expect(imported.map(({ id }) => id)).toEqual([created.id]);
    expect(await db.entries.getAll(created.id)).toEqual([]);
    expect(books.adapter.lastChangedAt(created.id)).toBe(
      exported!.lastChangedAt,
    );
    expect(await books.store.list()).toHaveLength(1);
    expect(books.removedFiscalPeriodIds).toEqual([]);
    const reopened = await openTestBooks(books.store);
    expect(await reopened.adapter.db.entries.getAll(created.id)).toEqual([]);
  });

  it("adds a period that is not in the app yet", async () => {
    const elsewhere = await openTestBooks(emptyStore());
    const made = await elsewhere.adapter.db.fiscalPeriods.create(
      USER,
      period2027,
    );
    const file = await elsewhere.adapter.exportBook(made.id);
    const books = await openTestBooks(emptyStore());
    await books.adapter.db.fiscalPeriods.create(USER, period2026);

    const inspected = await books.adapter.inspectBookFile(file!.bytes, USER);
    await books.adapter.importBookFile(
      file!.bytes,
      USER,
      expectationsOf(inspected),
    );

    expect(inspected[0]?.relation).toEqual({ kind: "new" });
    expect(await books.adapter.db.fiscalPeriods.getAll(USER)).toHaveLength(2);
    expect(books.adapter.lastChangedAt(made.id)).toBe(file!.lastChangedAt);
    expect(await books.store.list()).toHaveLength(2);
  });

  it("replaces a separately made book of the same dates and reports the removed period", async () => {
    const elsewhere = await openTestBooks(emptyStore());
    const other = await elsewhere.adapter.db.fiscalPeriods.create(
      USER,
      period2026,
    );
    const file = await elsewhere.adapter.exportBook(other.id);
    const books = await openTestBooks(emptyStore());
    const mine = await books.adapter.db.fiscalPeriods.create(USER, period2026);

    const inspected = await books.adapter.inspectBookFile(file!.bytes, USER);
    await books.adapter.importBookFile(
      file!.bytes,
      USER,
      expectationsOf(inspected),
    );

    expect(inspected[0]?.relation).toMatchObject({
      kind: "same_dates",
      existing: { id: mine.id },
    });
    expect(
      (await books.adapter.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([other.id]);
    expect(books.removedFiscalPeriodIds).toEqual([mine.id]);
    expect(await books.store.list()).toHaveLength(1);
  });

  it("refuses a book whose dates overlap a different period without matching it", async () => {
    const elsewhere = await openTestBooks(emptyStore());
    const other = await elsewhere.adapter.db.fiscalPeriods.create(USER, {
      name: "2026年度",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    const file = await elsewhere.adapter.exportBook(other.id);
    const books = await openTestBooks(emptyStore());
    const mine = await books.adapter.db.fiscalPeriods.create(USER, period2026);

    const inspected = await books.adapter.inspectBookFile(file!.bytes, USER);

    expect(inspected[0]?.relation).toMatchObject({
      kind: "overlapping",
      existing: [{ id: mine.id }],
    });
    await expect(
      books.adapter.importBookFile(
        file!.bytes,
        USER,
        expectationsOf(inspected),
      ),
    ).rejects.toBeInstanceOf(BookImportChangedError);
    expect(
      (await books.adapter.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([mine.id]);
  });

  it("refuses to import when the app changed after the file was inspected", async () => {
    const books = await openTestBooks(emptyStore());
    const { db } = books.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    const exported = await books.adapter.exportBook(created.id);
    const inspected = await books.adapter.inspectBookFile(
      exported!.bytes,
      USER,
    );

    await db.fiscalPeriods.patch(created.id, { name: "あとで変えた" });

    await expect(
      books.adapter.importBookFile(
        exported!.bytes,
        USER,
        expectationsOf(inspected),
      ),
    ).rejects.toBeInstanceOf(BookImportChangedError);
    expect((await db.fiscalPeriods.getById(created.id))?.name).toBe(
      "あとで変えた",
    );
  });

  it("splits a book that holds several periods and skips periods of another user", async () => {
    const bytes = await seededBookBytes({
      fiscalPeriods: [
        seedPeriod("fp-2026", period2026, USER),
        seedPeriod("fp-2027", period2027, USER),
        seedPeriod("fp-other", period2026, "someone-else"),
      ],
      entries: [
        {
          id: "entry-1",
          userId: USER,
          fiscalPeriodId: "fp-2026",
          ...entryInput("売上", "2026-06-01", 1000),
          lines: entryInput("売上", "2026-06-01", 1000).lines.map(
            (entryLine, index) => ({ ...entryLine, id: `line-${index}` }),
          ),
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      fixedAssets: [],
    });
    const books = await openTestBooks(emptyStore());

    const split = await splitBookFile(bytes);
    const inspected = await books.adapter.inspectBookFile(bytes, USER);
    await books.adapter.importBookFile(bytes, USER, expectationsOf(inspected));

    expect(split.map(({ fiscalPeriod }) => fiscalPeriod.id).sort()).toEqual([
      "fp-2026",
      "fp-2027",
      "fp-other",
    ]);
    expect(inspected.map(({ fiscalPeriod }) => fiscalPeriod.id)).toEqual([
      "fp-2026",
      "fp-2027",
    ]);
    expect(await books.store.list()).toHaveLength(2);
    expect(await books.adapter.db.entries.getAll("fp-2026")).toHaveLength(1);
    expect(await books.adapter.db.entries.getAll("fp-2027")).toEqual([]);
    const again = await books.adapter.inspectBookFile(bytes, USER);
    expect(
      again.map(
        ({ lastChangedAt, relation }) =>
          relation.kind === "same_period" &&
          relation.existingLastChangedAt === lastChangedAt,
      ),
    ).toEqual([true, true]);
  });

  it("keeps the content of every period when a seeded book is split", async () => {
    const store = await seededStore({
      fiscalPeriods: [
        seedPeriod("fp-2026", period2026, USER),
        seedPeriod("fp-2027", period2027, USER),
      ],
      entries: [],
      fixedAssets: [],
    });

    const books = await openTestBooks(store);

    expect(
      (await books.adapter.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual(["fp-2026", "fp-2027"]);
  });
});
