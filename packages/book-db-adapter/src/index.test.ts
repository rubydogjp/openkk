import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@rubydogjp/openkk-sqlite-db-adapter";

import {
  assertBookFileSize,
  BookEnvironmentError,
  createBookDbAdapter,
  BookFileFormatError,
  isBookContentError,
  MAX_BOOK_FILE_BYTES,
  readBookRecords,
  readStoredFiscalPeriods,
  rebuildBookFileBytes,
  type BookDbAdapter,
} from "./index.js";
import { createDiskDbAdapter } from "../../disk-db-adapter/src/index.js";
import { runDbPortConformance } from "../../engine/test-support/db-port-conformance.js";

const openAdapters: BookDbAdapter[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function open(bytes: Uint8Array | null): Promise<BookDbAdapter> {
  const adapter = await createBookDbAdapter(bytes);
  openAdapters.push(adapter);
  return adapter;
}

async function seededBytes(
  seed: Parameters<typeof createDiskDbAdapter>[1],
): Promise<Uint8Array> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "seed.openkk");
  (await createDiskDbAdapter(filePath, seed)).close();
  return new Uint8Array(fs.readFileSync(filePath));
}

runDbPortConformance("document-db-adapter", {
  makeAdapter: async () => (await open(null)).db,
  makeSeededAdapter: async (seed) => (await open(await seededBytes(seed))).db,
});

const period = {
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

describe("document-db-adapter change stamp", () => {
  it("reads the stamp a book file carries and keeps it while the book is only read", async () => {
    const first = await open(null);
    const created = await first.db.fiscalPeriods.create("user-1", period);
    const stamp = first.lastChangedAt();

    const reopened = await open(first.exportBytes());
    await reopened.db.fiscalPeriods.getById(created.id);

    expect(first.lastChangedAtOnOpen).toBeNull();
    expect(reopened.lastChangedAtOnOpen).toBe(stamp);
    expect(reopened.lastChangedAt()).toBe(stamp);
    expect(reopened.changedOnOpen).toBe(false);
    expect(reopened.listFiscalPeriodIds()).toEqual([created.id]);
  });

  it("gives a stamp to a book made before books carried one", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "old.openkk");
    (await createDiskDbAdapter(filePath, null)).close();
    const database = new DatabaseSync(filePath);
    database.exec(
      "UPDATE openkk_meta SET value = '5' WHERE key = 'schema_version'",
    );
    database.exec("DELETE FROM openkk_meta WHERE key = 'last_changed_at'");
    database.close();

    const opened = await open(new Uint8Array(fs.readFileSync(filePath)));

    expect(opened.lastChangedAtOnOpen).toBeNull();
    expect(opened.changedOnOpen).toBe(true);
    expect(Number.isSafeInteger(opened.lastChangedAt())).toBe(true);
  });

  it("keeps the content and can restore the stamp after compacting", async () => {
    const book = await open(null);
    const kept = await book.db.fiscalPeriods.create("user-1", period);
    const dropped = await book.db.fiscalPeriods.create("user-1", {
      name: "2027年分",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    const stamp = book.lastChangedAt();
    let notified = 0;
    book.onChange(() => {
      notified += 1;
    });

    await book.db.fiscalPeriods.remove(dropped.id);
    book.compact();
    book.restoreLastChangedAt(stamp);
    await book.db.fiscalPeriods.getById(kept.id);

    expect(book.lastChangedAt()).toBe(stamp);
    expect(book.listFiscalPeriodIds()).toEqual([kept.id]);
    expect(notified).toBe(1);
    expect((await open(book.exportBytes())).listFiscalPeriodIds()).toEqual([
      kept.id,
    ]);
  });
});

describe("document-db-adapter", () => {
  it("round-trips a book through exported bytes", async () => {
    const first = await open(null);
    const created = await first.db.fiscalPeriods.create("user-1", period);

    const reopened = await open(first.exportBytes());

    expect(await reopened.db.fiscalPeriods.getById(created.id)).toEqual(
      created,
    );
    expect(reopened.changedOnOpen).toBe(false);
  });

  it("opens a book file written by the CLI and writes back bytes it can read", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "book.openkk");
    const cli = await createDiskDbAdapter(filePath, null);
    const fromCli = await cli.db.fiscalPeriods.create("user-1", period);
    cli.close();

    const document = await open(new Uint8Array(fs.readFileSync(filePath)));
    const fromBrowser = await document.db.fiscalPeriods.create("user-1", {
      ...period,
      name: "2027年分",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    fs.writeFileSync(filePath, document.exportBytes());
    const cliAgain = await createDiskDbAdapter(filePath, null);
    const names = (await cliAgain.db.fiscalPeriods.getAll("user-1")).map(
      (record) => record.name,
    );
    cliAgain.close();

    expect(await document.db.fiscalPeriods.getById(fromCli.id)).toEqual(
      fromCli,
    );
    expect([...names].sort()).toEqual(["2026年分", fromBrowser.name]);
  });

  it("notifies listeners only after operations that change the book", async () => {
    const document = await open(null);
    let notifications = 0;
    const unsubscribe = document.onChange(() => {
      notifications += 1;
    });

    await document.db.fiscalPeriods.getAll("user-1");
    await document.db.masterData.getBookAccounts();
    const created = await document.db.fiscalPeriods.create("user-1", period);
    await document.db.fiscalPeriods.getById(created.id);
    await document.db.fiscalPeriods.start(created.id);
    await expect(document.db.fiscalPeriods.start(created.id)).rejects.toThrow();
    unsubscribe();
    await document.db.fiscalPeriods.patch(created.id, {
      openingBalancesCompleted: true,
    });

    expect(notifications).toBe(2);
  });

  it("marks a new book as changed so the host writes it once", async () => {
    expect((await open(null)).changedOnOpen).toBe(true);
  });

  it("rejects bytes that are not a SQLite database", async () => {
    await expect(
      createBookDbAdapter(new TextEncoder().encode("hello, world")),
    ).rejects.toMatchObject({ problem: "not_sqlite" });
  });

  it("rejects a SQLite database that is not an openkk book", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "other.sqlite3");
    const other = new DatabaseSync(filePath);
    other.exec("CREATE TABLE notes (body TEXT)");
    other.close();

    const error = await createBookDbAdapter(
      new Uint8Array(fs.readFileSync(filePath)),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BookFileFormatError);
    expect(error).toMatchObject({ problem: "not_openkk" });
  });

  it("refuses a book written by a newer schema", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "newer.openkk");
    (await createDiskDbAdapter(filePath, null)).close();
    const raw = new DatabaseSync(filePath);
    raw
      .prepare("UPDATE openkk_meta SET value = ? WHERE key = 'schema_version'")
      .run(String(SCHEMA_VERSION + 1));
    raw.close();

    await expect(
      createBookDbAdapter(new Uint8Array(fs.readFileSync(filePath))),
    ).rejects.toMatchObject({ problem: "newer_schema" });
  });
});

function changedBookBytes(
  bytes: Uint8Array,
  statements: readonly string[],
): Uint8Array {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "changed.openkk");
  fs.writeFileSync(filePath, bytes);
  const database = new DatabaseSync(filePath, {
    enableForeignKeyConstraints: false,
  });
  try {
    database.exec("PRAGMA ignore_check_constraints = ON");
    for (const statement of statements) database.exec(statement);
  } finally {
    database.close();
  }
  return new Uint8Array(fs.readFileSync(filePath));
}

const sameDayLine = {
  partnerName: "",
  taxCategoryId: "tax_out_of_scope",
  businessCategoryId: "",
  amount: 1000,
};

function sameDayEntry(description: string) {
  return {
    date: "2026-04-01",
    description,
    localId: null,
    businessRate: 1,
    lines: [
      { ...sameDayLine, side: "debit" as const, bookAccountId: "acct_cash" },
      { ...sameDayLine, side: "credit" as const, bookAccountId: "acct_sales" },
    ],
  };
}

function assetInput(name: string) {
  return {
    name,
    acquisitionDate: "2026-04-01",
    acquisitionCost: 200000,
    usefulLife: 4,
    depreciationMethod: "straight_line" as const,
    businessRate: 1,
    bookAccountId: "acct_equipment",
  };
}

async function bookWithSameDayRecords(): Promise<{
  book: BookDbAdapter;
  fiscalPeriodId: string;
  descriptions: string[];
  assetNames: string[];
}> {
  const book = await open(null);
  const created = await book.db.fiscalPeriods.create("user-1", period);
  await book.db.fiscalPeriods.start(created.id);
  const written = Array.from({ length: 30 }, (_, index) => `entry-${index}`);
  const entries = await book.db.entries.importMany(
    "user-1",
    created.id,
    written.map(sameDayEntry),
  );
  await book.db.entries.remove(entries[3]!.id);
  await book.db.entries.remove(entries[29]!.id);
  await book.db.entries.create("user-1", created.id, sameDayEntry("last"));
  const assetNames = ["z-asset", "m-asset", "a-asset"];
  for (const name of assetNames) {
    await book.db.fixedAssets.create("user-1", created.id, assetInput(name));
  }
  return {
    book,
    fiscalPeriodId: created.id,
    descriptions: [
      ...written.filter((_, index) => index !== 3 && index !== 29),
      "last",
    ],
    assetNames,
  };
}

async function orderOf(book: BookDbAdapter, fiscalPeriodId: string) {
  return {
    descriptions: (await book.db.entries.getAll(fiscalPeriodId)).map(
      (entry) => entry.description,
    ),
    assetNames: (await book.db.fixedAssets.getAll(fiscalPeriodId)).map(
      (asset) => asset.name,
    ),
  };
}

describe("document-db-adapter order of records written at the same time", () => {
  it("keeps the written order after compacting, exporting and reopening", async () => {
    const { book, fiscalPeriodId, descriptions, assetNames } =
      await bookWithSameDayRecords();
    const expected = { descriptions, assetNames };

    expect(await orderOf(book, fiscalPeriodId)).toEqual(expected);
    book.compact();
    expect(await orderOf(book, fiscalPeriodId)).toEqual(expected);
    const reopened = await open(book.exportBytes());
    expect(await orderOf(reopened, fiscalPeriodId)).toEqual(expected);
    reopened.compact();
    expect(
      await orderOf(await open(reopened.exportBytes()), fiscalPeriodId),
    ).toEqual(expected);
  });

  it("keeps the written order in a book rebuilt from its records", async () => {
    const { book, fiscalPeriodId, descriptions, assetNames } =
      await bookWithSameDayRecords();
    const [records] = await readBookRecords(book);

    const rebuilt = await open(
      await rebuildBookFileBytes(records!, book.lastChangedAt()),
    );

    expect(await orderOf(rebuilt, fiscalPeriodId)).toEqual({
      descriptions,
      assetNames,
    });
  });
});

describe("document-db-adapter rebuilt book", () => {
  it("holds the same records, timestamps and stamp, and nothing else the source carried", async () => {
    const { book } = await bookWithSameDayRecords();
    const stamp = book.lastChangedAt();
    const source = await open(
      changedBookBytes(book.exportBytes(), [
        "CREATE TABLE smuggled(id INTEGER PRIMARY KEY, body TEXT)",
        "CREATE VIEW smuggled_view AS SELECT id FROM entries",
        "CREATE TRIGGER smuggled_trigger AFTER INSERT ON entries BEGIN DELETE FROM entry_lines; END",
        "INSERT INTO openkk_meta(key, value) VALUES('smuggled', '1')",
        "UPDATE entries SET created_at = 1700000000000, updated_at = 1700000500000",
        "UPDATE fixed_assets SET created_at = 1700000001000, updated_at = 1700000600000",
        "UPDATE fiscal_periods SET created_at = 1690000000000, updated_at = 1690000700000",
      ]),
    );
    const [records] = await readBookRecords(source);

    const bytes = await rebuildBookFileBytes(records!, stamp);

    const rebuilt = await open(bytes);
    expect(rebuilt.changedOnOpen).toBe(false);
    expect(rebuilt.lastChangedAt()).toBe(stamp);
    expect(await readBookRecords(rebuilt)).toEqual([records]);
    expect(records!.entries[0]).toMatchObject({
      createdAt: "2023-11-14T22:13:20.000Z",
      updatedAt: "2023-11-14T22:21:40.000Z",
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "rebuilt.openkk");
    fs.writeFileSync(filePath, bytes);
    const raw = new DatabaseSync(filePath, { readOnly: true });
    try {
      expect(
        raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type IN ('trigger', 'view') OR name LIKE 'smuggled%'",
          )
          .all(),
      ).toEqual([]);
      expect(
        raw
          .prepare("SELECT key FROM openkk_meta ORDER BY key")
          .all()
          .map((row) => row.key),
      ).toEqual(["last_changed_at", "schema_version"]);
    } finally {
      raw.close();
    }
  });

  it("refuses a period row whose id differs from the id in its data", async () => {
    const book = await open(null);
    const created = await book.db.fiscalPeriods.create("user-1", period);
    const source = await open(
      changedBookBytes(book.exportBytes(), [
        `UPDATE fiscal_periods SET id = 'fp-other' WHERE id = '${created.id}'`,
      ]),
    );

    await expect(readBookRecords(source)).rejects.toMatchObject({
      name: "BookFileFormatError",
      problem: "invalid_content",
    });
  });

  it("refuses records in which two entries carry the same entry number", async () => {
    const book = await open(null);
    const created = await book.db.fiscalPeriods.create("user-1", period);
    await book.db.fiscalPeriods.start(created.id);
    await book.db.entries.importMany("user-1", created.id, [
      { ...sameDayEntry("a"), localId: "A-1" },
      { ...sameDayEntry("b"), localId: "A-2" },
    ]);
    const source = await open(
      changedBookBytes(book.exportBytes(), [
        "DROP INDEX idx_entries_fp_local_id",
        "UPDATE entries SET local_id = 'A-1'",
      ]),
    );
    const [records] = await readBookRecords(source);

    await expect(
      rebuildBookFileBytes(records!, source.lastChangedAt()),
    ).rejects.toThrow(/duplicate entry localId/);
  });
});

describe("document-db-adapter change stamp of a book file", () => {
  it.each([
    ["is not a number", "soon"],
    ["is negative", "-1"],
    ["is past the largest time a date can hold", "8640000000000001"],
    ["is past the largest safe integer", "9007199254740993"],
  ])("refuses a book whose stamp %s", async (_label, stored) => {
    const book = await open(null);
    await book.db.fiscalPeriods.create("user-1", period);
    const bytes = changedBookBytes(book.exportBytes(), [
      `UPDATE openkk_meta SET value = '${stored}' WHERE key = 'last_changed_at'`,
    ]);

    await expect(createBookDbAdapter(bytes)).rejects.toMatchObject({
      name: "BookFileFormatError",
      problem: "invalid_content",
    });
  });
});

describe("document-db-adapter stored fiscal periods of bytes it may not be able to open", () => {
  it("reads the id and the label of each stored period without validating it", async () => {
    const book = await open(null);
    const created = await book.db.fiscalPeriods.create("user-1", period);
    const bytes = changedBookBytes(book.exportBytes(), [
      "UPDATE fiscal_periods SET data = json_set(data, '$.phase', 'unknown_phase')",
    ]);

    expect(await readStoredFiscalPeriods(bytes)).toEqual([
      { id: created.id, label: period },
    ]);
    expect(
      await readStoredFiscalPeriods(new TextEncoder().encode("not a book")),
    ).toEqual([]);
  });
});

describe("document-db-adapter book file size", () => {
  it("refuses bytes past the limit and accepts bytes at the limit", () => {
    expect(() =>
      assertBookFileSize(new Uint8Array(MAX_BOOK_FILE_BYTES)),
    ).not.toThrow();
    expect(() =>
      assertBookFileSize(new Uint8Array(MAX_BOOK_FILE_BYTES + 1)),
    ).toThrow(BookFileFormatError);
  });
});

describe("isBookContentError", () => {
  function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  it.each([
    ["a book format error", new BookFileFormatError("not_openkk", "no meta")],
    ["a validation error", new Error("Invalid fiscal period data in SQLite")],
    ["a timestamp that cannot be read", new RangeError("Invalid time value")],
    [
      "a corrupt database",
      Object.assign(namedError("SQLite3Error", "malformed"), {
        resultCode: 11,
      }),
    ],
    [
      "a failed migration of the stored data",
      new Error("migration to version 6 failed", {
        cause: new Error("no such table: entries"),
      }),
    ],
  ])("sees %s as caused by the book's content", (_label, error) => {
    expect(isBookContentError(error)).toBe(true);
  });

  it.each([
    [
      "an allocation failure of the wasm heap",
      namedError("WasmAllocError", ""),
    ],
    ["a wasm trap", namedError("RuntimeError", "memory access out of bounds")],
    [
      "an array buffer the browser cannot allocate",
      new RangeError("Array buffer allocation failed"),
    ],
    [
      "SQLite running out of memory",
      Object.assign(namedError("SQLite3Error", "out of memory"), {
        resultCode: 7,
      }),
    ],
    [
      "SQLite failing to read or write",
      Object.assign(namedError("SQLite3Error", "disk I/O error"), {
        resultCode: 10 | (1 << 8),
      }),
    ],
    ["deserializing without memory", new BookEnvironmentError("no memory")],
    [
      "a migration that ran out of memory",
      new Error("migration to version 6 failed", {
        cause: namedError("WasmAllocError", ""),
      }),
    ],
    ["something that is not an error", "boom"],
  ])("does not blame the book's content for %s", (_label, error) => {
    expect(isBookContentError(error)).toBe(false);
  });
});
