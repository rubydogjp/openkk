import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BookFileFormatError,
  createBookDbAdapter,
  MAX_BOOK_FILE_BYTES,
} from "@rubydogjp/openkk-book-db-adapter";
import { SCHEMA_VERSION } from "@rubydogjp/openkk-sqlite-db-adapter";

import {
  changedBookBytes,
  closeTestBooks,
  emptyStore,
  openTestBooks,
} from "../test-support/books.js";
import {
  createMemoryBookStore,
  type BookImportExpectation,
  type BookStore,
  type InspectedBookPeriod,
} from "./index.js";

afterEach(() => {
  closeTestBooks();
  vi.restoreAllMocks();
});

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

function entryInput(description: string) {
  return {
    date: "2026-06-01",
    description,
    localId: null,
    businessRate: 1,
    lines: [
      {
        ...line,
        side: "debit" as const,
        bookAccountId: "acct_cash",
        amount: 1000,
      },
      {
        ...line,
        side: "credit" as const,
        bookAccountId: "acct_sales",
        amount: 1000,
      },
    ],
  };
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

async function bookFileOf(
  range: typeof period2026,
  descriptions: readonly string[],
): Promise<{ fiscalPeriodId: string; bytes: Uint8Array; stamp: number }> {
  const elsewhere = await openTestBooks(emptyStore());
  const { db } = elsewhere.adapter;
  const created = await db.fiscalPeriods.create(USER, range);
  await db.fiscalPeriods.start(created.id);
  for (const description of descriptions) {
    await db.entries.create(USER, created.id, {
      ...entryInput(description),
      date: `${range.startDate.slice(0, 4)}-06-01`,
    });
  }
  const exported = await elsewhere.adapter.exportBook(created.id);
  return {
    fiscalPeriodId: created.id,
    bytes: exported!.bytes,
    stamp: exported!.lastChangedAt,
  };
}

async function storeWith(
  books: ReadonlyArray<[string, Uint8Array]>,
): Promise<BookStore> {
  return createMemoryBookStore(new Map(books));
}

function silenceErrors(): string[] {
  const logged: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  return logged;
}

describe("books-db-adapter importing a book file", () => {
  it("rebuilds the book from its records, keeping timestamps, order and the file's stamp", async () => {
    const file = await bookFileOf(period2026, ["first", "second", "third"]);
    const tampered = changedBookBytes(file.bytes, [
      "CREATE TABLE smuggled(id INTEGER PRIMARY KEY)",
      "CREATE TRIGGER smuggled_trigger AFTER INSERT ON entries BEGIN DELETE FROM entry_lines; END",
      "INSERT INTO openkk_meta(key, value) VALUES('smuggled', '1')",
      "UPDATE entries SET created_at = 1700000000000, updated_at = 1700000500000",
    ]);
    const books = await openTestBooks(emptyStore());

    const inspected = await books.adapter.inspectBookFile(tampered, USER);
    await books.adapter.importBookFile(
      tampered,
      USER,
      expectationsOf(inspected),
    );
    await books.adapter.flush();

    expect(books.adapter.lastChangedAt(file.fiscalPeriodId)).toBe(file.stamp);
    const entries = await books.adapter.db.entries.getAll(file.fiscalPeriodId);
    expect(entries.map(({ description }) => description)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(entries.map(({ createdAt }) => createdAt)).toEqual([
      "2023-11-14T22:13:20.000Z",
      "2023-11-14T22:13:20.000Z",
      "2023-11-14T22:13:20.000Z",
    ]);
    const [name] = await books.store.list();
    const stored = await createBookDbAdapter(await books.store.read(name!));
    try {
      expect(stored.changedOnOpen).toBe(false);
      expect(stored.lastChangedAt()).toBe(file.stamp);
      const objects = (await stored.db.entries.getAll(file.fiscalPeriodId))
        .length;
      expect(objects).toBe(3);
    } finally {
      stored.close();
    }
    const again = await books.adapter.inspectBookFile(tampered, USER);
    expect(again[0]?.relation).toMatchObject({
      kind: "same_period",
      existingLastChangedAt: file.stamp,
    });
  });

  it.each([
    [
      "a period row whose id differs from the id in its data",
      (fiscalPeriodId: string) => [
        `UPDATE fiscal_periods SET id = 'fp-renamed' WHERE id = '${fiscalPeriodId}'`,
      ],
    ],
    [
      "two entries with the same entry number",
      () => [
        "DROP INDEX idx_entries_fp_local_id",
        "UPDATE entries SET local_id = 'A-1'",
      ],
    ],
    [
      "a stamp that is not a number",
      () => [
        "UPDATE openkk_meta SET value = 'later' WHERE key = 'last_changed_at'",
      ],
    ],
    [
      "a stamp close to the largest safe integer",
      () => [
        "UPDATE openkk_meta SET value = '9007199254740990' WHERE key = 'last_changed_at'",
      ],
    ],
    [
      "an entry that breaks the rules",
      () => ["UPDATE entry_lines SET amount = 5 WHERE position = 0"],
    ],
  ])(
    "refuses a file with %s as not a book and keeps nothing",
    async (_label, statements) => {
      const file = await bookFileOf(period2026, ["first", "second"]);
      const tampered = changedBookBytes(
        file.bytes,
        statements(file.fiscalPeriodId),
      );
      const books = await openTestBooks(emptyStore());

      const inspecting = books.adapter.inspectBookFile(tampered, USER);
      const importing = books.adapter.importBookFile(tampered, USER, [
        {
          fiscalPeriodId: file.fiscalPeriodId,
          relation: "new",
          existingFiscalPeriodId: null,
          existingLastChangedAt: null,
        },
      ]);

      for (const attempt of [inspecting, importing]) {
        await expect(attempt).rejects.toBeInstanceOf(BookFileFormatError);
      }
      expect(await books.store.list()).toEqual([]);
      expect(await books.adapter.db.fiscalPeriods.getAll(USER)).toEqual([]);
    },
  );

  it("refuses a file larger than a book can be before reading it", async () => {
    const books = await openTestBooks(emptyStore());

    await expect(
      books.adapter.inspectBookFile(
        new Uint8Array(MAX_BOOK_FILE_BYTES + 1),
        USER,
      ),
    ).rejects.toMatchObject({
      name: "BookFileFormatError",
      problem: "too_large",
    });
  });

  it("tells listeners about the periods that were imported before a later one failed", async () => {
    const elsewhere = await openTestBooks(emptyStore());
    const { db } = elsewhere.adapter;
    const first = await db.fiscalPeriods.create(USER, period2026);
    const second = await db.fiscalPeriods.create(USER, period2027);
    const fileFirst = await elsewhere.adapter.exportBook(first.id);
    const fileSecond = await elsewhere.adapter.exportBook(second.id);
    let writes = 0;
    const inner = emptyStore();
    const store: BookStore = {
      list: () => inner.list(),
      read: (name) => inner.read(name),
      remove: (name) => inner.remove(name),
      async write(name, bytes) {
        writes += 1;
        if (writes === 2) throw new Error("disk full");
        await inner.write(name, bytes);
      },
    };
    const books = await openTestBooks(store);
    let notified = 0;
    books.adapter.subscribe(() => {
      notified += 1;
    });
    const fileWithBoth = changedBookBytes(fileFirst!.bytes, []);
    const both = await mergeBooks(fileWithBoth, fileSecond!.bytes);

    const inspected = await books.adapter.inspectBookFile(both, USER);
    await expect(
      books.adapter.importBookFile(both, USER, expectationsOf(inspected)),
    ).rejects.toThrow(/disk full/);

    expect(
      (await books.adapter.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([first.id]);
    expect(notified).toBeGreaterThan(0);
  });
});

async function mergeBooks(
  target: Uint8Array,
  other: Uint8Array,
): Promise<Uint8Array> {
  const source = await createBookDbAdapter(other);
  try {
    const [periodId] = source.listFiscalPeriodIds();
    const period = await source.db.fiscalPeriods.getById(periodId!);
    const merged = await createBookDbAdapter(target);
    try {
      const created = await merged.db.fiscalPeriods.importArchived(USER, {
        fiscalPeriod: {
          name: period!.name,
          startDate: period!.startDate,
          endDate: period!.endDate,
          phase: period!.phase,
          openingBalancesCompleted: period!.openingBalancesCompleted,
          documentsReceivedCompleted: period!.documentsReceivedCompleted,
          opening: period!.opening,
        },
        entries: [],
        fixedAssets: [],
      });
      expect(created.startDate).toBe(period!.startDate);
      return merged.exportBytes();
    } finally {
      merged.close();
    }
  } finally {
    source.close();
  }
}

describe("books-db-adapter opening the books it keeps", () => {
  it("stops opening when the store cannot be read, instead of setting books aside", async () => {
    const logged = silenceErrors();
    const file = await bookFileOf(period2026, []);
    const inner = await storeWith([["a.openkk", file.bytes]]);
    const store: BookStore = {
      ...inner,
      read: async () => {
        throw new Error("The file could not be read");
      },
    };

    await expect(openTestBooks(store)).rejects.toThrow(/could not be read/);
    expect(logged.join("\n")).toMatch(/could not be read/);
  });

  it("sets aside a book whose records break the rules and keeps the others readable", async () => {
    const logged = silenceErrors();
    const good = await bookFileOf(period2027, ["2027 entry"]);
    const broken = await bookFileOf(period2026, ["2026 entry"]);
    const store = await storeWith([
      [
        "a.openkk",
        changedBookBytes(broken.bytes, [
          "UPDATE entry_lines SET amount = 5 WHERE position = 0",
        ]),
      ],
      ["b.openkk", good.bytes],
    ]);

    const books = await openTestBooks(store);

    expect(
      (await books.adapter.db.fiscalPeriods.getAll(USER)).map(({ id }) => id),
    ).toEqual([good.fiscalPeriodId]);
    expect(
      books.adapter.unreadableBooks.map(
        ({ name, fiscalPeriodId, fiscalPeriod, replaceable }) => ({
          name,
          fiscalPeriodId,
          fiscalPeriod,
          replaceable,
        }),
      ),
    ).toEqual([
      {
        name: "a.openkk",
        fiscalPeriodId: broken.fiscalPeriodId,
        fiscalPeriod: period2026,
        replaceable: true,
      },
    ]);
    expect(logged.join("\n")).toMatch(/a\.openkk cannot be read/);
  });

  it("keeps the more recently changed of two books that hold the same period", async () => {
    silenceErrors();
    const elsewhere = await openTestBooks(emptyStore());
    const { db } = elsewhere.adapter;
    const created = await db.fiscalPeriods.create(USER, period2026);
    const older = await elsewhere.adapter.exportBook(created.id);
    await db.fiscalPeriods.patch(created.id, { name: "新しい名前" });
    const newer = await elsewhere.adapter.exportBook(created.id);
    const store = await storeWith([
      ["a.openkk", newer!.bytes],
      ["0.openkk", older!.bytes],
    ]);

    const books = await openTestBooks(store);

    expect(
      (await books.adapter.db.fiscalPeriods.getById(created.id))?.name,
    ).toBe("新しい名前");
    expect(books.adapter.unreadableBooks.map(({ name }) => name)).toEqual([
      "0.openkk",
    ]);
    expect(await store.list()).toHaveLength(2);
  });

  it("restores a set-aside book from a file of the same period in place of the broken one", async () => {
    silenceErrors();
    const file = await bookFileOf(period2026, ["restored"]);
    const store = await storeWith([
      [
        "broken.openkk",
        changedBookBytes(file.bytes, [
          "UPDATE entry_lines SET amount = 5 WHERE position = 0",
        ]),
      ],
    ]);
    const books = await openTestBooks(store);

    const inspected = await books.adapter.inspectBookFile(file.bytes, USER);
    await books.adapter.importBookFile(
      file.bytes,
      USER,
      inspected.map(({ fiscalPeriod, relation }) => ({
        fiscalPeriodId: fiscalPeriod.id,
        relation: relation.kind,
        existingFiscalPeriodId: null,
        existingLastChangedAt: null,
      })),
    );
    await books.adapter.flush();

    expect(inspected[0]?.relation).toEqual({
      kind: "unreadable_book",
      existing: period2026,
      replaceable: true,
    });
    expect(await store.list()).toEqual(["broken.openkk"]);
    expect(books.adapter.unreadableBooks).toEqual([]);
    expect(
      (await books.adapter.db.entries.getAll(file.fiscalPeriodId)).map(
        ({ description }) => description,
      ),
    ).toEqual(["restored"]);
    const reopened = await openTestBooks(store);
    expect(reopened.adapter.unreadableBooks).toEqual([]);
  });

  it("does not overwrite a set-aside book written by a newer version", async () => {
    silenceErrors();
    const file = await bookFileOf(period2026, ["mine"]);
    const newer = changedBookBytes(file.bytes, [
      `UPDATE openkk_meta SET value = '${SCHEMA_VERSION + 1}' WHERE key = 'schema_version'`,
    ]);
    const store = await storeWith([["newer.openkk", newer]]);
    const books = await openTestBooks(store);

    const inspected = await books.adapter.inspectBookFile(file.bytes, USER);

    expect(inspected[0]?.relation).toEqual({
      kind: "unreadable_book",
      existing: period2026,
      replaceable: false,
    });
    await expect(
      books.adapter.importBookFile(file.bytes, USER, [
        {
          fiscalPeriodId: file.fiscalPeriodId,
          relation: "unreadable_book",
          existingFiscalPeriodId: null,
          existingLastChangedAt: null,
        },
      ]),
    ).rejects.toThrow(/changed after the file was inspected/);
    expect(await store.read("newer.openkk")).toEqual(newer);
  });
});

describe("books-db-adapter flush", () => {
  it("waits for every book before reporting the first failure", async () => {
    const inner = emptyStore();
    const written: string[] = [];
    let failingName: string | null = null;
    let heldName: string | null = null;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store: BookStore = {
      list: () => inner.list(),
      read: (name) => inner.read(name),
      remove: (name) => inner.remove(name),
      async write(name, bytes) {
        if (name === failingName) throw new Error("disk full");
        if (name === heldName) await held;
        written.push(name);
        await inner.write(name, bytes);
      },
    };
    const books = await openTestBooks(store);
    const { db } = books.adapter;
    const first = await db.fiscalPeriods.create(USER, period2026);
    const second = await db.fiscalPeriods.create(USER, period2027);
    await books.adapter.flush();
    const [firstName, secondName] = written;
    failingName = firstName!;
    heldName = secondName!;
    written.length = 0;
    await db.fiscalPeriods.patch(second.id, { name: "2027年" });
    await db.fiscalPeriods.patch(first.id, { name: "2026年" });

    const flushing = books.adapter.flush();
    const outcome = flushing.then(
      () => "saved",
      () => "failed",
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const beforeRelease = written.slice();
    release();

    expect(await outcome).toBe("failed");
    expect(beforeRelease).toEqual([]);
    expect(written).toEqual([secondName]);
  });
});
