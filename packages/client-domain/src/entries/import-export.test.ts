import { describe, expect, it } from "vitest";

import { AppError } from "../shared/app-error.js";
import {
  assertJournalImportSize,
  decodeJournalImportBytes,
  exportEntriesAsJson,
  exportEntriesAsCsv,
  importEntriesFromJson,
  importEntriesFromCsv,
} from "./import-export.js";
import {
  assertJournalImportEntryCount,
  assertJournalImportLineCount,
  assertJournalEntryLineCount,
  MAX_JOURNAL_IMPORT_ENTRIES,
  MAX_JOURNAL_IMPORT_LINES,
  MAX_JOURNAL_ENTRY_LINES,
  MAX_JOURNAL_IMPORT_SIZE,
} from "./journal-import-policy.js";
import type { EntryRecord } from "./entry-record.js";

function entry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  const base: EntryRecord = {
    id: "e-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-15",
    weekday: "木",
    debit: "普通預金",
    debitType: "asset",
    debitAmount: "100,000",
    credit: "売上",
    creditType: "revenue",
    creditAmount: "100,000",
    description: "売上入金",
    partner: "取引先A",
    businessRate: "",
    taxCategory: "課税 10%",
    businessCategory: "第5種（サービス業等）",
    localId: "e-1",
    lines: null,
    businessRateRatio: null,
    debitBookAccountId: null,
    creditBookAccountId: null,
    debitTaxCategoryId: null,
    creditTaxCategoryId: null,
    debitBusinessCategoryId: null,
    creditBusinessCategoryId: null,
  };
  return Object.assign(base, overrides);
}

describe("journal import limits", () => {
  it("rejects oversized files before reading or parsing their contents", () => {
    expect(() => assertJournalImportSize(MAX_JOURNAL_IMPORT_SIZE)).not.toThrow();
    expect(() =>
      assertJournalImportSize(MAX_JOURNAL_IMPORT_SIZE + 1),
    ).toThrow(/size limit/);
  });

  it("rejects malformed UTF-8 instead of silently replacing bytes", () => {
    expect(() => decodeJournalImportBytes(Uint8Array.of(0xc3, 0x28))).toThrow(
      /not valid UTF-8/,
    );
  });

  it("rejects oversized batches before normalizing every row", () => {
    expect(() =>
      assertJournalImportEntryCount(MAX_JOURNAL_IMPORT_ENTRIES),
    ).not.toThrow();
    expect(() =>
      assertJournalImportEntryCount(MAX_JOURNAL_IMPORT_ENTRIES + 1),
    ).toThrow(/too many entries/);
  });

  it("rejects an oversized compound entry before normalizing every line", () => {
    expect(() =>
      assertJournalEntryLineCount(MAX_JOURNAL_ENTRY_LINES),
    ).not.toThrow();
    expect(() =>
      assertJournalEntryLineCount(MAX_JOURNAL_ENTRY_LINES + 1),
    ).toThrow(/too many lines/);
  });

  it("rejects an oversized total across otherwise bounded entries", () => {
    expect(() =>
      assertJournalImportLineCount(MAX_JOURNAL_IMPORT_LINES),
    ).not.toThrow();
    expect(() =>
      assertJournalImportLineCount(MAX_JOURNAL_IMPORT_LINES + 1),
    ).toThrow(/too many lines/);
  });
});

describe("JSON export/import round-trip", () => {
  it("preserves all fields through export then import", () => {
    const original = [
      entry({
        id: "e-1",
        localId: "sale-jan",
        businessRate: "33.3333333333",
        businessRateRatio: 1 / 3,
      }),
      entry({
        id: "e-2",
        localId: "rent-jan",
        debit: "地代家賃",
        debitType: "expense",
        credit: "普通預金",
        creditType: "asset",
        description: "家賃",
      }),
    ];
    const json = exportEntriesAsJson(original);
    const parsed = JSON.parse(json) as { schema: string; entries: unknown[] };
    expect(parsed.schema).toBe("openkk-journal-v1");
    expect(parsed.entries).toHaveLength(2);

    const imported = importEntriesFromJson({
      text: json,
      fiscalPeriodId: "fp-2",
    });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.localId).toBe("sale-jan");
    expect(imported[0]?.debit).toBe("普通預金");
    expect(imported[0]?.businessRateRatio).toBe(1 / 3);
    expect(imported[1]?.localId).toBe("rent-jan");
    expect(imported[1]?.debit).toBe("地代家賃");
    expect(imported[0]?.fiscalPeriodId).toBe("fp-2");
  });

  it("falls back to id when localId is absent on export", () => {
    const e = entry({ id: "entry-xyz", localId: undefined });
    const json = exportEntriesAsJson([e]);
    const parsed = JSON.parse(json) as { entries: Array<{ localId: string }> };
    expect(parsed.entries[0]?.localId).toBe("entry-xyz");
  });

  it("falls back to id when a persisted localId is blank", () => {
    const e = entry({ id: "entry-blank", localId: "" });
    const json = exportEntriesAsJson([e]);
    const parsed = JSON.parse(json) as { entries: Array<{ localId: string }> };
    expect(parsed.entries[0]?.localId).toBe("entry-blank");
    expect(
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-2" })[0]?.localId,
    ).toBe("entry-blank");

    const csv = exportEntriesAsCsv([e]);
    expect(
      importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-2" })[0]?.localId,
    ).toBe("entry-blank");
  });

  it("accepts JSON with a leading UTF-8 BOM", () => {
    const imported = importEntriesFromJson({
      text: `\uFEFF${exportEntriesAsJson([entry({ localId: "bom-json" })])}`,
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.localId).toBe("bom-json");
  });

  it("preserves compound journal lines through JSON export then import", () => {
    const original = entry({
      localId: "compound-1",
      debit: "仕入",
      debitType: "cost_of_sales",
      debitAmount: "168,000",
      credit: "未払金",
      creditType: "liability",
      creditAmount: "210,000",
      lines: [
        {
          side: "debit",
          accountName: "仕入",
          accountType: "cost_of_sales",
          amount: "168,000",
          bookAccountId: "acct_cost_of_sales_商品仕入高",
          partnerName: "仕入先A",
          taxCategoryId: "tax_8",
          businessCategoryId: "biz_2",
          id: null,
          taxCategoryName: null,
          businessCategoryName: null,
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
          bookAccountId: "acct_expense_荷造運賃",
          id: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
          bookAccountId: "acct_accrued_expense",
          id: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
      ],
    });

    const imported = importEntriesFromJson({
      text: exportEntriesAsJson([original]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.lines).toEqual(original.lines);
  });

  it("preserves simple-entry account and category IDs as exported lines", () => {
    const original = entry({
      lines: undefined,
      debitBookAccountId: "acct_bank_custom",
      creditBookAccountId: "acct_sales_custom",
      debitTaxCategoryId: "tax_debit_custom",
      creditTaxCategoryId: "tax_credit_custom",
      debitBusinessCategoryId: "biz_debit_custom",
      creditBusinessCategoryId: "biz_credit_custom",
    });

    const imported = importEntriesFromJson({
      text: exportEntriesAsJson([original]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.lines).toEqual([
      expect.objectContaining({
        side: "debit",
        bookAccountId: "acct_bank_custom",
        taxCategoryId: "tax_debit_custom",
        businessCategoryId: "biz_debit_custom",
      }),
      expect.objectContaining({
        side: "credit",
        bookAccountId: "acct_sales_custom",
        taxCategoryId: "tax_credit_custom",
        businessCategoryId: "biz_credit_custom",
      }),
    ]);
  });
});

describe("importEntriesFromJson — error handling", () => {
  it("throws AppError when JSON cannot be parsed", () => {
    const error = captureError(() =>
      importEntriesFromJson({ text: "{", fiscalPeriodId: "fp-1" }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("JSON parse");
    expect((error as AppError).messageForUser).toContain("JSONファイル");
  });

  it("throws when entries array is missing", () => {
    const error = captureError(() =>
      importEntriesFromJson({
        text: JSON.stringify({ schema: "openkk-journal-v1" }),
        fiscalPeriodId: "fp-1",
      }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "entries array not found",
    );
    expect((error as AppError).messageForUser).toContain("取込ファイル");
  });

  it("reports a format error when the JSON root is not an object", () => {
    for (const text of ["null", "[]", '"journal"']) {
      const error = captureError(() =>
        importEntriesFromJson({ text, fiscalPeriodId: "fp-1" }),
      );

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).messageForDeveloper).toContain("JSON parse");
      expect((error as AppError).messageForUser).toContain("JSONファイル");
    }
  });

  it("throws when entries is not an array", () => {
    expect(() =>
      importEntriesFromJson({
        text: JSON.stringify({ entries: "bad" }),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow("entries array not found");
  });

  it("rejects a JSON that declares an unsupported schema", () => {
    const json = JSON.stringify({
      schema: "some-other-format-v9",
      entries: [
        {
          localId: "e1",
          date: "2026-01-01",
          debit: "現金",
          debitType: "asset",
          debitAmount: "100",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "100",
          description: "旧形式の取引",
          partner: "",
          businessRate: "",
          taxCategory: "対象外",
          businessCategory: "",
        },
      ],
    });
    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/unsupported journal schema/);
  });

  it("accepts a schemaless JSON for backward compatibility", () => {
    const json = JSON.stringify({
      entries: [
        {
          localId: "e1",
          date: "2026-01-01",
          debit: "現金",
          debitType: "asset",
          debitAmount: "100",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "100",
          description: "現金売上",
          partner: "",
          businessRate: "",
          taxCategory: "対象外",
          businessCategory: "",
        },
      ],
    });
    expect(
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toHaveLength(1);
  });

  it("throws on duplicate localId", () => {
    const json = exportEntriesAsJson([
      entry({ localId: "dup" }),
      entry({ id: "e-2", localId: "dup" }),
    ]);
    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/duplicate localId/);
  });

  it("throws when localId is empty string", () => {
    const json = JSON.stringify({
      entries: [
        {
          localId: "",
          date: "2026-01-01",
          debit: "現金",
          debitType: "asset",
          debitAmount: "0",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "0",
          description: "",
          partner: "",
          businessRate: "",
          taxCategory: "対象外",
          businessCategory: "",
        },
      ],
    });
    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: localId is required/);
  });

  it("throws when an entry date is invalid", () => {
    const json = JSON.stringify({
      entries: [
        {
          localId: "bad-date",
          date: "2026-02-29",
          debit: "現金",
          debitType: "asset",
          debitAmount: "0",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "0",
          description: "",
          partner: "",
          businessRate: "",
          taxCategory: "対象外",
          businessCategory: "",
        },
      ],
    });
    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: invalid date \(2026-02-29\)/);
  });

  it("normalises missing optional fields to safe defaults", () => {
    const json = JSON.stringify({
      entries: [
        {
          localId: "e1",
          date: "2026-03-05",
          debit: "現金",
          debitType: "asset",
          debitAmount: "5000",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "5000",
          description: "現金売上",
          partner: "",
          businessRate: "",
          taxCategory: "",
          businessCategory: "",
        },
      ],
    });
    const [e] = importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" });
    expect(e?.taxCategory).toBe("対象外");
    expect(e?.businessCategory).toBe("対象外");
    expect(e?.weekday).toBeTruthy();
  });

  it("rejects non-finite imported amounts instead of silently using zero", () => {
    const json = JSON.stringify({
      entries: [
        {
          localId: "e1",
          date: "2026-03-05",
          debit: "現金",
          debitType: "asset",
          debitAmount: "Infinity",
          credit: "売上",
          creditType: "revenue",
          creditAmount: "-Infinity",
          description: "不正金額",
          partner: "",
          businessRate: "",
          taxCategory: "",
          businessCategory: "",
        },
      ],
    });

    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: invalid debit amount/);
  });

  it("rejects an invalid exact business rate", () => {
    const payload = JSON.parse(exportEntriesAsJson([entry()])) as {
      entries: Array<{ businessRateRatio?: unknown }>;
    };
    payload.entries[0]!.businessRateRatio = 1.01;

    expect(() =>
      importEntriesFromJson({
        text: JSON.stringify(payload),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 1: invalid exact business rate/);
  });

  it("rejects compound totals outside the safe integer range", () => {
    const amount = String(Number.MAX_SAFE_INTEGER);
    const json = exportEntriesAsJson([
      entry({
        lines: [
          {
            side: "debit",
            accountName: "現金",
            accountType: "asset",
            amount,
            id: null,
            bookAccountId: null,
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
          },
          {
            side: "debit",
            accountName: "現金",
            accountType: "asset",
            amount,
            id: null,
            bookAccountId: null,
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
          },
          {
            side: "credit",
            accountName: "売上",
            accountType: "revenue",
            amount,
            id: null,
            bookAccountId: null,
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
          },
          {
            side: "credit",
            accountName: "売上",
            accountType: "revenue",
            amount,
            id: null,
            bookAccountId: null,
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
          },
        ],
      }),
    ]);

    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: entry totals exceed the safe integer range/);
  });

  it("rejects non-object entries and malformed compound lines with row context", () => {
    expect(() =>
      importEntriesFromJson({
        text: JSON.stringify({ entries: [null] }),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 1: entry must be an object/);

    const malformed = JSON.parse(exportEntriesAsJson([entry()])) as {
      entries: Array<Record<string, unknown>>;
    };
    malformed.entries[0]!.lines = [null];
    expect(() =>
      importEntriesFromJson({
        text: JSON.stringify(malformed),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 1: line 1 must be an object/);

    malformed.entries[0]!.lines = [
      {
        side: "debit",
        accountName: "現金",
        accountType: "asset",
        amount: 1.5,
        id: null,
        bookAccountId: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: null,
        businessCategoryId: null,
        businessCategoryName: null,
      },
      {
        side: "credit",
        accountName: "売上",
        accountType: "revenue",
        amount: 1.5,
        id: null,
        bookAccountId: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: null,
        businessCategoryId: null,
        businessCategoryName: null,
      },
    ];
    expect(() =>
      importEntriesFromJson({
        text: JSON.stringify(malformed),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 1: invalid line 1 amount/);
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

describe("CSV export/import round-trip", () => {
  it("preserves all fields through export then import", () => {
    const original = [
      entry({
        localId: "a1",
        businessRate: "33.3333333333",
        businessRateRatio: 1 / 3,
      }),
      entry({
        id: "e-2",
        localId: "a2",
        debit: "地代家賃",
        debitType: "expense",
        debitAmount: "50,000",
        credit: "普通預金",
        creditType: "asset",
        creditAmount: "50,000",
        description: "家賃",
      }),
    ];
    const csv = exportEntriesAsCsv(original);
    const imported = importEntriesFromCsv({
      text: csv,
      fiscalPeriodId: "fp-2",
    });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.localId).toBe("a1");
    expect(imported[0]?.debit).toBe("普通預金");
    expect(imported[0]?.businessRateRatio).toBe(1 / 3);
    expect(imported[1]?.localId).toBe("a2");
    expect(imported[1]?.debit).toBe("地代家賃");
    expect(imported[0]?.debitType).toBe("asset");
  });

  it("preserves compound journal lines through CSV export then import", () => {
    const original = entry({
      localId: "compound-csv-1",
      debit: "仕入",
      debitType: "cost_of_sales",
      debitAmount: "168,000",
      credit: "未払金",
      creditType: "liability",
      creditAmount: "210,000",
      lines: [
        {
          side: "debit",
          accountName: "仕入",
          accountType: "cost_of_sales",
          amount: "168,000",
          bookAccountId: "acct_cost_of_sales_商品仕入高",
          partnerName: "仕入先A",
          taxCategoryId: "tax_8",
          businessCategoryId: "biz_2",
          id: null,
          taxCategoryName: null,
          businessCategoryName: null,
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
          bookAccountId: "acct_expense_荷造運賃",
          id: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
          bookAccountId: "acct_accrued_expense",
          id: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
          businessCategoryName: null,
        },
      ],
    });

    const imported = importEntriesFromCsv({
      text: exportEntriesAsCsv([original]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.lines).toEqual(original.lines);
  });

  it("handles quoted fields containing commas", () => {
    const original = [
      entry({
        localId: "q1",
        description: 'A,B "quoted"',
        partner: "株式会社,テスト",
      }),
    ];
    const csv = exportEntriesAsCsv(original);
    const imported = importEntriesFromCsv({
      text: csv,
      fiscalPeriodId: "fp-1",
    });
    expect(imported[0]?.description).toBe('A,B "quoted"');
    expect(imported[0]?.partner).toBe("株式会社,テスト");
  });

  it("preserves carriage returns inside exported fields", () => {
    const description = "1行目\r2行目";
    const imported = importEntriesFromCsv({
      text: exportEntriesAsCsv([entry({ description })]),
      fiscalPeriodId: "fp-1",
    });

    expect(imported[0]?.description).toBe(description);
  });

  it("handles CRLF line endings", () => {
    const csv = exportEntriesAsCsv([entry({ localId: "crlf1" })]).replace(
      /\n/g,
      "\r\n",
    );
    const imported = importEntriesFromCsv({
      text: csv,
      fiscalPeriodId: "fp-1",
    });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.localId).toBe("crlf1");
  });

  it("accepts CSV with a leading UTF-8 BOM", () => {
    const csv = `\uFEFF${exportEntriesAsCsv([entry({ localId: "bom-csv" })])}`;
    const imported = importEntriesFromCsv({
      text: csv,
      fiscalPeriodId: "fp-1",
    });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.localId).toBe("bom-csv");
  });

  it("returns empty array for header-only CSV", () => {
    const csv = exportEntriesAsCsv([]);
    const imported = importEntriesFromCsv({
      text: csv,
      fiscalPeriodId: "fp-1",
    });
    expect(imported).toHaveLength(0);
  });

  it("protects spreadsheet formulas without changing re-imported values", () => {
    const original = entry({
      localId: "=local-id",
      description: "+SUM(1,2)",
      partner: "@partner",
      taxCategory: "-1+2",
    });
    const csv = exportEntriesAsCsv([original]);

    expect(csv).toContain("'=local-id");
    expect(csv).toContain("'+SUM(1,2)");
    expect(csv).toContain("'@partner");
    expect(csv).toContain("'-1+2");
    const imported = importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-2" });
    expect(imported[0]?.localId).toBe(original.localId);
    expect(imported[0]?.description).toBe(original.description);
    expect(imported[0]?.partner).toBe(original.partner);
    expect(imported[0]?.taxCategory).toBe(original.taxCategory);
  });

  it("does not strip a user's literal leading apostrophe", () => {
    const description = "'=literal text";
    const imported = importEntriesFromCsv({
      text: exportEntriesAsCsv([entry({ description })]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.description).toBe(description);
  });

  it("recomputes weekday from the imported date", () => {
    const imported = importEntriesFromCsv({
      text: exportEntriesAsCsv([entry({ weekday: "誤" })]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.weekday).toBe("木");
  });
});

describe("importEntriesFromCsv — error handling", () => {
  it("rejects a malformed header even when there are no data rows", () => {
    expect(() =>
      importEntriesFromCsv({
        text: "localId,description",
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/CSV header missing/);
  });

  it("throws when required header columns are missing", () => {
    const badCsv = "localId,description\ne1,test";
    expect(() =>
      importEntriesFromCsv({ text: badCsv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/CSV header missing/);
  });

  it("throws on duplicate localId in CSV", () => {
    const csv = exportEntriesAsCsv([
      entry({ localId: "dup" }),
      entry({ id: "e-2", localId: "dup" }),
    ]);
    expect(() =>
      importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/duplicate localId/);
  });

  it("throws when localId cell is blank", () => {
    const headers =
      "localId,date,weekday,debit,debitType,debitAmount,credit,creditType,creditAmount,description,partner,businessRate,taxCategory,businessCategory";
    const row = ",2026-01-01,月,現金,asset,1000,売上,revenue,1000,test,,,,";
    expect(() =>
      importEntriesFromCsv({
        text: `${headers}\n${row}`,
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 2: localId is required/);
  });

  it("throws when a CSV entry date is invalid", () => {
    const headers =
      "localId,date,weekday,debit,debitType,debitAmount,credit,creditType,creditAmount,description,partner,businessRate,taxCategory,businessCategory";
    const row =
      "bad-date,2026-13-01,月,現金,asset,1000,売上,revenue,1000,test,,,,";
    expect(() =>
      importEntriesFromCsv({
        text: `${headers}\n${row}`,
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 2: invalid date \(2026-13-01\)/);
  });

  it("rejects an unterminated quoted CSV field", () => {
    const csv = `${exportEntriesAsCsv([entry()])}\n"unterminated`;
    expect(() =>
      importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/unterminated quoted field/);
  });

  it("rejects quotes in the middle of an unquoted field", () => {
    const csv = exportEntriesAsCsv([entry()]).replace(
      "売上入金",
      '売"上入金',
    );

    expect(() =>
      importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/unexpected quote/);
  });

  it("rejects characters after a closing quote", () => {
    const csv = exportEntriesAsCsv([entry()]).replace(
      "売上入金",
      '"売上入金"x',
    );

    expect(() =>
      importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/unexpected character after a closing quote/);
  });
});
