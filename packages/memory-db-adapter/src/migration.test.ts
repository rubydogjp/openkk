import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createSqliteDbAdapter,
  runMigrations,
  SCHEMA_MIGRATIONS,
  SCHEMA_VERSION,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-adapter";
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

describe("SQLite v1 to v4 migration", () => {
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
      documentsReceivedCompleted: false,
      opening: {
        id: "opening-1",
        userId: "user-1",
        fiscalPeriodId: "fp-1",
        openingBalanceLines: [
          { id: "balance-1", accountId: "a:現金", amount: 1000 },
          { id: "balance-2", accountId: "l:元入金", amount: 1000 },
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
                taxCategoryName: "対象外",
                businessCategoryName: "対象外",
              },
              {
                id: "journal-line-2",
                side: "credit",
                bookAccountId: "acct_sales",
                amount: 1000,
                partnerName: "",
                taxCategoryName: "custom-tax",
                businessCategoryName: "custom-business",
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
          taxCategoryName: "対象外",
          businessCategoryName: "対象外",
        },
        {
          side: "credit",
          bookAccountId: "acct_sales",
          amount: 1000,
          partnerName: "",
          taxCategoryName: "custom-tax",
          businessCategoryName: "custom-business",
        },
      ],
    };
    const entryWithoutLocalId = {
      ...entry,
      id: "entry-without-local-id",
      localId: "",
    };
    const fixedAsset = {
      id: "asset-1",
      fiscalPeriodId: period.id,
      name: "PC",
      acquisitionDate: "2026-01-01",
      acquisitionCost: 100_000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      status: "active",
      disposalDate: "",
      disposalPrice: 0,
      bookAccountId: "acct_equipment",
    };
    const purgedPeriod = {
      id: "fp-purged",
      name: "FY2025",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      stage: "post_closing",
      archived: true,
      archiveDataAvailable: false,
      settingsCompleted: true,
      openingBalancesCompleted: true,
      documentsReceivedCompleted: true,
    };
    const startedPeriod = {
      id: "fp-started",
      name: "FY2027",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      archived: false,
      settingsCompleted: true,
      openingBalancesCompleted: false,
      documentsReceivedCompleted: false,
    };
    for (const item of [period, purgedPeriod, startedPeriod]) {
      db.exec({
        sql: `INSERT INTO fiscal_periods VALUES(?, ?, ?, 1, 1)`,
        bind: [item.id, "user-1", JSON.stringify(item)],
      });
    }
    db.exec({
      sql: `INSERT INTO entries VALUES(?, ?, ?, ?, 1, 1)`,
      bind: [entry.id, period.id, entry.date, JSON.stringify(entry)],
    });
    db.exec({
      sql: `INSERT INTO entries VALUES(?, ?, ?, ?, 1, 1)`,
      bind: [
        entryWithoutLocalId.id,
        period.id,
        entryWithoutLocalId.date,
        JSON.stringify(entryWithoutLocalId),
      ],
    });
    db.exec({
      sql: `INSERT INTO fixed_assets VALUES(?, ?, ?, 1, 1)`,
      bind: [
        fixedAsset.id,
        period.id,
        JSON.stringify(fixedAsset),
      ],
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
        `SELECT local_id FROM entries WHERE id='entry-without-local-id'`,
      ),
    ).toBeNull();
    expect(db.selectValue(`SELECT COUNT(*) FROM entry_lines`)).toBe(4);
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
        `SELECT json_extract(data, '$.archiveStatus') FROM fiscal_periods WHERE id='fp-purged'`,
      ),
    ).toBe("purged");
    expect(
      db.selectValue(
        `SELECT json_extract(data, '$.phase') FROM fiscal_periods WHERE id='fp-started'`,
      ),
    ).toBe("journalizing");
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM fiscal_periods
          WHERE json_type(data, '$.archiveDataAvailable') IS NOT NULL
             OR json_type(data, '$.settingsCompleted') IS NOT NULL`,
      ),
    ).toBe(0);
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
      db.selectValue(
        `SELECT account_id FROM opening_balance_lines WHERE fiscal_period_id='fp-1'`,
      ),
    ).toBe("a:現金");
    expect(
      db.selectValue(
        `SELECT id FROM opening_journals WHERE fiscal_period_id='fp-1'`,
      ),
    ).toBe("journal-1");
    expect(
      db.selectValue(
        `SELECT id FROM opening_journal_lines WHERE fiscal_period_id='fp-1'`,
      ),
    ).toBe("journal-line-1");
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM entry_lines WHERE entry_id='entry-1'`,
      ),
    ).toBe(2);
    expect(
      db.selectValue(
        `SELECT json_type(data, '$.disposalDate') FROM fixed_assets WHERE id='asset-1'`,
      ),
    ).toBe("null");
    expect(
      db.selectValue(
        `SELECT json_type(data, '$.archivedAt') FROM fiscal_periods WHERE id='fp-1'`,
      ),
    ).toBe("null");
    expect(
      db.selectValue(
        `SELECT json_type(data, '$.disposalPrice') FROM fixed_assets WHERE id='asset-1'`,
      ),
    ).toBe("null");
    expect(
      db.selectValue(
        `SELECT tax_category_id FROM entry_lines WHERE entry_id='entry-1' AND position=0`,
      ),
    ).toBe("tax_out_of_scope");
    expect(
      db.selectValue(
        `SELECT tax_category_id FROM opening_journal_lines WHERE fiscal_period_id='fp-1' AND position=0`,
      ),
    ).toBe("tax_out_of_scope");
    expect(
      db.selectValue(
        `SELECT tax_category_id FROM entry_lines WHERE entry_id='entry-1' AND position=1`,
      ),
    ).toBe("custom-tax");
    expect(
      db.selectValue(
        `SELECT business_category_id FROM opening_journal_lines WHERE fiscal_period_id='fp-1' AND position=1`,
      ),
    ).toBe("custom-business");
    const sync = db as unknown as { exec(arg: unknown): unknown };
    const sqlDb: SqlDb = { exec: async (arg) => sync.exec(arg) };
    const adapter = await createSqliteDbAdapter(sqlDb, null);
    await expect(adapter.fiscalPeriods.getById("fp-1")).resolves.toMatchObject({
      id: "fp-1",
      phase: "pre_closing",
      openingBalancesCompleted: true,
      documentsReceivedCompleted: false,
    });
    const migratedEntries = await adapter.entries.getAll("fp-1");
    expect(migratedEntries).toHaveLength(2);
    expect(
      migratedEntries.find((item) => item.id === "entry-without-local-id")
        ?.localId,
    ).toBeNull();
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
    expect(db.selectValue(`SELECT COUNT(*) FROM opening_balance_lines`)).toBe(
      0,
    );
    expect(db.selectValue(`SELECT COUNT(*) FROM opening_journals`)).toBe(0);
    expect(db.selectValue(`SELECT COUNT(*) FROM opening_journal_lines`)).toBe(
      0,
    );
    expect(db.selectValue(`SELECT COUNT(*) FROM entry_lines`)).toBe(0);
  });

  it("clears disposal fields that the fixed asset status does not use", async () => {
    const db = await createVersion1Db();
    db.exec({
      sql: `INSERT INTO fiscal_periods VALUES(?, ?, ?, 1, 1)`,
      bind: [
        "fp-1",
        "user-1",
        JSON.stringify({
          id: "fp-1",
          name: "FY2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          stage: "journalizing",
          archived: false,
          settingsCompleted: true,
          openingBalancesCompleted: true,
          documentsReceivedCompleted: false,
        }),
      ],
    });
    const assets = [
      { id: "asset-sold", status: "sold", disposalPrice: 5000 },
      { id: "asset-disposed", status: "disposed", disposalPrice: 5000 },
      { id: "asset-retired", status: "retired", disposalPrice: 0 },
      { id: "asset-active", status: "active", disposalPrice: 5000 },
    ];
    for (const asset of assets) {
      db.exec({
        sql: `INSERT INTO fixed_assets VALUES(?, ?, ?, 1, 1)`,
        bind: [
          asset.id,
          "fp-1",
          JSON.stringify({
            ...asset,
            disposalDate: "2026-06-30",
            fiscalPeriodId: "fp-1",
            name: "PC",
            acquisitionDate: "2026-01-01",
            acquisitionCost: 100_000,
            usefulLife: 4,
            depreciationMethod: "straight_line",
            businessRate: 1,
            bookAccountId: "acct_equipment",
          }),
        ],
      });
    }

    runMigrations(db);

    const disposal = (id: string) =>
      db.selectArray(
        `SELECT json_extract(data, '$.disposalDate'), json_extract(data, '$.disposalPrice')
          FROM fixed_assets WHERE id = ?`,
        [id],
      );
    expect(disposal("asset-sold")).toEqual(["2026-06-30", 5000]);
    expect(disposal("asset-disposed")).toEqual(["2026-06-30", null]);
    expect(disposal("asset-retired")).toEqual([null, null]);
    expect(disposal("asset-active")).toEqual([null, null]);
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
