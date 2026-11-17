import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  BookFileFormatError,
  createBookDbAdapter,
} from "@rubydogjp/openkk-book-db-adapter";
import type { FiscalPeriodDbRecord } from "@rubydogjp/openkk-engine";

import {
  closeTestBooks,
  seededBookBytes,
  tempBookPath,
} from "../test-support/books.js";
import { splitBookFile, splitReadableBookFilePeriods } from "./book-file.js";

afterEach(closeTestBooks);

const USER = "user-1";

function seedPeriod(id: string, year: number): FiscalPeriodDbRecord {
  return {
    id,
    userId: USER,
    name: `${year}年分`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    phase: "journalizing",
    archiveStatus: "active",
    archivedAt: null,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    masterSetId: "jp-2026",
    opening: { balanceLines: [], journals: [] },
    createdAt: `${year}-01-01T00:00:00.000Z`,
    updatedAt: `${year}-01-01T00:00:00.000Z`,
  };
}

async function bookBytesWithChangedRows(
  periods: FiscalPeriodDbRecord[],
  changes: ReadonlyArray<{ sql: string; id: string }>,
): Promise<Uint8Array> {
  const bytes = await seededBookBytes({
    fiscalPeriods: periods,
    entries: [],
    fixedAssets: [],
  });
  const filePath = tempBookPath();
  fs.writeFileSync(filePath, bytes);
  const database = new DatabaseSync(filePath);
  try {
    database.exec("PRAGMA ignore_check_constraints = ON");
    for (const { sql, id } of changes) database.prepare(sql).run(id);
  } finally {
    database.close();
  }
  return new Uint8Array(fs.readFileSync(filePath));
}

const UNKNOWN_PHASE_SQL =
  "UPDATE fiscal_periods SET data = json_set(data, '$.phase', 'unknown_phase') WHERE id = ?";
const NOT_A_RECORD_SQL =
  "UPDATE fiscal_periods SET data = 'not a record' WHERE id = ?";

describe("splitReadableBookFilePeriods", () => {
  it("splits out the periods it can read and names the one it cannot", async () => {
    const bytes = await bookBytesWithChangedRows(
      [
        seedPeriod("fp-2025", 2025),
        seedPeriod("fp-2026", 2026),
        seedPeriod("fp-2027", 2027),
      ],
      [{ sql: UNKNOWN_PHASE_SQL, id: "fp-2026" }],
    );

    const split = await splitReadableBookFilePeriods(bytes);

    expect(split.periods.map(({ fiscalPeriod }) => fiscalPeriod.id)).toEqual([
      "fp-2025",
      "fp-2027",
    ]);
    expect(
      split.unreadable.map(({ fiscalPeriodId, name, startDate, endDate }) => ({
        fiscalPeriodId,
        name,
        startDate,
        endDate,
      })),
    ).toEqual([
      {
        fiscalPeriodId: "fp-2026",
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    ]);
    for (const period of split.periods) {
      expect(
        (await splitBookFile(period.bytes)).map(
          ({ fiscalPeriod }) => fiscalPeriod.id,
        ),
      ).toEqual([period.fiscalPeriod.id]);
    }
  });

  it("tells the change stamp each split-out book holds", async () => {
    const bytes = await seededBookBytes({
      fiscalPeriods: [seedPeriod("fp-2025", 2025), seedPeriod("fp-2026", 2026)],
      entries: [],
      fixedAssets: [],
    });
    const single = await seededBookBytes({
      fiscalPeriods: [seedPeriod("fp-2027", 2027)],
      entries: [],
      fixedAssets: [],
    });

    for (const source of [bytes, single]) {
      for (const period of (await splitReadableBookFilePeriods(source))
        .periods) {
        const book = await createBookDbAdapter(period.bytes);
        try {
          expect(book.lastChangedAt()).toBe(period.bookLastChangedAt);
        } finally {
          book.close();
        }
      }
    }
  });

  it("leaves the name empty when the stored period is not a record", async () => {
    const bytes = await bookBytesWithChangedRows(
      [seedPeriod("fp-2025", 2025), seedPeriod("fp-2026", 2026)],
      [
        { sql: UNKNOWN_PHASE_SQL, id: "fp-2025" },
        { sql: NOT_A_RECORD_SQL, id: "fp-2026" },
      ],
    );

    const split = await splitReadableBookFilePeriods(bytes);

    expect(split.periods).toEqual([]);
    expect(
      split.unreadable.map(({ fiscalPeriodId, name }) => [
        fiscalPeriodId,
        name,
      ]),
    ).toEqual([
      ["fp-2025", "2025年分"],
      ["fp-2026", null],
    ]);
  });

  it("answers one unreadable period without an id for bytes that are not a book", async () => {
    const split = await splitReadableBookFilePeriods(
      new TextEncoder().encode("this is not a database"),
    );

    expect(split.periods).toEqual([]);
    expect(split.unreadable).toHaveLength(1);
    expect(split.unreadable[0]).toMatchObject({
      fiscalPeriodId: null,
      name: null,
      startDate: null,
      endDate: null,
    });
    expect(split.unreadable[0]?.error).toBeInstanceOf(BookFileFormatError);
  });
});

describe("splitBookFile", () => {
  it("refuses the whole book when one period cannot be read", async () => {
    const bytes = await bookBytesWithChangedRows(
      [seedPeriod("fp-2025", 2025), seedPeriod("fp-2026", 2026)],
      [{ sql: UNKNOWN_PHASE_SQL, id: "fp-2026" }],
    );

    await expect(splitBookFile(bytes)).rejects.toThrow();
  });
});
