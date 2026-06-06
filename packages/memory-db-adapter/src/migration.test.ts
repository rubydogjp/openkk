import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  runMigrations,
  SCHEMA_MIGRATIONS,
  SCHEMA_VERSION,
} from "@rubydogjp/openkk-server-ports";
import { describe, expect, it } from "vitest";

async function createVersion1Db() {
  const sqlite3 = await sqlite3InitModule({
    print: () => undefined,
    printErr: () => undefined,
  });
  const db = new sqlite3.oo1.DB(":memory:");
  db.exec(SCHEMA_MIGRATIONS[0]!.sql);
  db.exec({
    sql: `INSERT INTO openkk_meta(key, value) VALUES('schema_version', '1')`,
  });
  return db;
}

describe("SQLite v1 to v2 migration", () => {
  it("adds constraints and preserves valid records", async () => {
    const db = await createVersion1Db();
    const period = {
      id: "fp-1",
      name: "FY2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      stage: "journalizing",
      archived: false,
      settingsCompleted: true,
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
      opening: {
        id: "opening-1",
        userId: "user-1",
        fiscalPeriodId: "fp-1",
        openingBalanceLines: [
          { id: "balance-1", accountId: "acct_cash", amount: 1000 },
        ],
        carryoverJournals: [
          {
            id: "journal-1",
            date: "2026-01-01",
            description: "carryover",
            businessRate: 1,
            lines: [
              {
                id: "journal-line-1",
                side: "debit",
                bookAccountId: "acct_cash",
                amount: 1000,
                partnerName: "",
                taxCategoryName: "tax-0",
                businessCategoryName: "",
              },
            ],
          },
        ],
      },
    };
    const entry = {
      id: "entry-1",
      fiscalPeriodId: "fp-1",
      date: "2026-04-01",
      description: "opening",
      localId: "source-1",
      businessRate: 1,
      lines: [
        {
          side: "debit",
          bookAccountId: "acct_cash",
          amount: 1000,
          partnerName: "",
          taxCategoryName: "tax-0",
          businessCategoryName: "",
        },
      ],
    };
    db.exec({
      sql: `INSERT INTO fiscal_periods VALUES(?, ?, ?, 1, 1)`,
      bind: [period.id, "user-1", JSON.stringify(period)],
    });
    db.exec({
      sql: `INSERT INTO entries VALUES(?, ?, ?, ?, 1, 1)`,
      bind: [entry.id, period.id, entry.date, JSON.stringify(entry)],
    });
    db.exec({
      sql: `INSERT INTO closings VALUES(?, ?, ?)`,
      bind: [period.id, 2026, 1],
    });
    db.exec("PRAGMA foreign_keys = ON");

    runMigrations(db);

    expect(
      db.selectValue(
        `SELECT value FROM openkk_meta WHERE key='schema_version'`,
      ),
    ).toBe(String(SCHEMA_VERSION));
    expect(
      db.selectValue(`SELECT local_id FROM entries WHERE id='entry-1'`),
    ).toBe("source-1");
    expect(
      db.selectValue(
        `SELECT json_type(data, '$.opening') FROM fiscal_periods WHERE id='fp-1'`,
      ),
    ).toBeNull();
    expect(
      db.selectValue(
        `SELECT json_extract(data, '$.phase') FROM fiscal_periods WHERE id='fp-1'`,
      ),
    ).toBe("pre_closing");
    expect(
      db.selectValue(
        `SELECT json_extract(data, '$.archiveStatus') FROM fiscal_periods WHERE id='fp-1'`,
      ),
    ).toBe("active");
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM pre_closings WHERE fiscal_period_id='fp-1'`,
      ),
    ).toBe(1);
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM closings WHERE fiscal_period_id='fp-1'`,
      ),
    ).toBe(0);
    expect(
      db.selectValue(`SELECT id FROM openings WHERE fiscal_period_id='fp-1'`),
    ).toBe("opening-1");
    expect(
      db.selectValue(
        `SELECT account_id FROM opening_balance_lines WHERE opening_id='opening-1'`,
      ),
    ).toBe("acct_cash");
    expect(
      db.selectValue(
        `SELECT id FROM opening_journals WHERE opening_id='opening-1'`,
      ),
    ).toBe("journal-1");
    expect(
      db.selectValue(
        `SELECT id FROM opening_journal_lines WHERE opening_id='opening-1'`,
      ),
    ).toBe("journal-line-1");
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM entry_lines WHERE entry_id='entry-1'`,
      ),
    ).toBe(1);
    expect(
      db.selectValue(
        `SELECT tax_category_id FROM entry_lines WHERE entry_id='entry-1'`,
      ),
    ).toBe("tax-0");
    expect(
      db.selectValue(
        `SELECT tax_category_id FROM opening_journal_lines WHERE opening_id='opening-1'`,
      ),
    ).toBe("tax-0");
    const queryPlan = db.exec({
      sql: `EXPLAIN QUERY PLAN
        SELECT id FROM entries
        WHERE fiscal_period_id = ? AND date >= ? AND date < ?
        ORDER BY date, created_at, id`,
      bind: ["fp-1", "2026-04-01", "2026-05-01"],
      returnValue: "resultRows",
      rowMode: "array",
    }) as unknown as Array<[number, number, number, string]>;
    expect(queryPlan.map((row) => row[3]).join(" ")).toContain(
      "idx_entries_fp_date_created_id",
    );
    expect(() =>
      db.exec({
        sql: `INSERT INTO entries VALUES(?, ?, ?, ?, ?, ?, 1, 1)`,
        bind: ["entry-invalid", "fp-1", "2026-02-30", "", "invalid", 1],
      }),
    ).toThrow(/CHECK constraint failed/);
    db.exec(`DELETE FROM fiscal_periods WHERE id='fp-1'`);
    expect(db.selectValue(`SELECT COUNT(*) FROM entries`)).toBe(0);
    expect(db.selectValue(`SELECT COUNT(*) FROM openings`)).toBe(0);
    expect(db.selectValue(`SELECT COUNT(*) FROM opening_balance_lines`)).toBe(
      0,
    );
    expect(db.selectValue(`SELECT COUNT(*) FROM opening_journals`)).toBe(0);
    expect(db.selectValue(`SELECT COUNT(*) FROM opening_journal_lines`)).toBe(
      0,
    );
    expect(db.selectValue(`SELECT COUNT(*) FROM entry_lines`)).toBe(0);
  });

  it("rolls back instead of accepting malformed stored JSON", async () => {
    const db = await createVersion1Db();
    db.exec({
      sql: `INSERT INTO fiscal_periods VALUES('fp-1', 'user-1', '{invalid', 1, 1)`,
    });

    expect(() => runMigrations(db)).toThrow(/migration to version 2 failed/);
    expect(
      db.selectValue(
        `SELECT value FROM openkk_meta WHERE key='schema_version'`,
      ),
    ).toBe("1");
    expect(db.selectValue(`SELECT COUNT(*) FROM fiscal_periods`)).toBe(1);
  });

  it("rolls back instead of silently deleting orphan records", async () => {
    const db = await createVersion1Db();
    db.exec({
      sql: `INSERT INTO entries VALUES(?, ?, ?, ?, 1, 1)`,
      bind: [
        "entry-orphan",
        "missing-period",
        "2026-04-01",
        JSON.stringify({
          id: "entry-orphan",
          fiscalPeriodId: "missing-period",
          date: "2026-04-01",
          description: "orphan",
          localId: "",
          businessRate: 1,
          lines: [],
        }),
      ],
    });

    expect(() => runMigrations(db)).toThrow(/migration to version 2 failed/);
    expect(
      db.selectValue(
        `SELECT value FROM openkk_meta WHERE key='schema_version'`,
      ),
    ).toBe("1");
    expect(db.selectValue(`SELECT COUNT(*) FROM entries`)).toBe(1);
  });
});
