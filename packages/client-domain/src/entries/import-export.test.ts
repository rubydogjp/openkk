import { describe, expect, it } from "vitest";

import { AppError } from "../shared/app-error";
import {
  exportEntriesAsJson,
  exportEntriesAsCsv,
  importEntriesFromJson,
  importEntriesFromCsv,
} from "./import-export";
import type { EntryRecord } from "./entry-record";

function entry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
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
    ...overrides,
  };
}

describe("JSON export/import round-trip", () => {
  it("preserves all fields through export then import", () => {
    const original = [
      entry({ id: "e-1", localId: "sale-jan" }),
      entry({ id: "e-2", localId: "rent-jan", debit: "地代家賃", debitType: "expense", credit: "普通預金", creditType: "asset", description: "家賃" }),
    ];
    const json = exportEntriesAsJson(original);
    const parsed = JSON.parse(json) as { schema: string; entries: unknown[] };
    expect(parsed.schema).toBe("openkk-journal-v1");
    expect(parsed.entries).toHaveLength(2);

    const imported = importEntriesFromJson({ text: json, fiscalPeriodId: "fp-2" });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.localId).toBe("sale-jan");
    expect(imported[0]?.debit).toBe("普通預金");
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
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
          bookAccountId: "acct_expense_荷造運賃",
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
          bookAccountId: "acct_accrued_expense",
        },
      ],
    });

    const imported = importEntriesFromJson({
      text: exportEntriesAsJson([original]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.lines).toEqual(original.lines);
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
      importEntriesFromJson({ text: JSON.stringify({ schema: "openkk-journal-v1" }), fiscalPeriodId: "fp-1" }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "entries array not found",
    );
    expect((error as AppError).messageForUser).toContain("取込ファイル");
  });

  it("throws when entries is not an array", () => {
    expect(() =>
      importEntriesFromJson({ text: JSON.stringify({ entries: "bad" }), fiscalPeriodId: "fp-1" }),
    ).toThrow("entries array not found");
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
      entries: [{ localId: "", date: "2026-01-01", debit: "現金", debitType: "asset", debitAmount: "0", credit: "売上", creditType: "revenue", creditAmount: "0", description: "", partner: "", businessRate: "", taxCategory: "対象外", businessCategory: "" }],
    });
    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: localId is required/);
  });

  it("throws when an entry date is invalid", () => {
    const json = JSON.stringify({
      entries: [{ localId: "bad-date", date: "2026-02-29", debit: "現金", debitType: "asset", debitAmount: "0", credit: "売上", creditType: "revenue", creditAmount: "0", description: "", partner: "", businessRate: "", taxCategory: "対象外", businessCategory: "" }],
    });
    expect(() =>
      importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: invalid date \(2026-02-29\)/);
  });

  it("normalises missing optional fields to safe defaults", () => {
    const json = JSON.stringify({
      entries: [{ localId: "e1", date: "2026-03-05", debit: "現金", debitType: "asset", debitAmount: "5000", credit: "売上", creditType: "revenue", creditAmount: "5000", description: "", partner: "", businessRate: "", taxCategory: "", businessCategory: "" }],
    });
    const [e] = importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" });
    expect(e?.taxCategory).toBe("対象外");
    expect(e?.businessCategory).toBe("対象外");
    expect(e?.weekday).toBeTruthy();
  });

  it("normalises non-finite imported amounts to zero", () => {
    const json = JSON.stringify({
      entries: [{ localId: "e1", date: "2026-03-05", debit: "現金", debitType: "asset", debitAmount: "Infinity", credit: "売上", creditType: "revenue", creditAmount: "-Infinity", description: "", partner: "", businessRate: "", taxCategory: "", businessCategory: "" }],
    });

    const [e] = importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" });

    expect(e?.debitAmount).toBe("0");
    expect(e?.creditAmount).toBe("0");
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
      entry({ localId: "a1" }),
      entry({ id: "e-2", localId: "a2", debit: "地代家賃", debitType: "expense", debitAmount: "50,000", credit: "普通預金", creditType: "asset", creditAmount: "50,000", description: "家賃" }),
    ];
    const csv = exportEntriesAsCsv(original);
    const imported = importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-2" });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.localId).toBe("a1");
    expect(imported[0]?.debit).toBe("普通預金");
    expect(imported[1]?.localId).toBe("a2");
    expect(imported[1]?.debit).toBe("地代家賃");
    expect(imported[0]?.debitType).toBe("asset");
  });

  it("handles quoted fields containing commas", () => {
    const original = [entry({ localId: "q1", description: 'A,B "quoted"', partner: "株式会社,テスト" })];
    const csv = exportEntriesAsCsv(original);
    const imported = importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" });
    expect(imported[0]?.description).toBe('A,B "quoted"');
    expect(imported[0]?.partner).toBe("株式会社,テスト");
  });

  it("handles CRLF line endings", () => {
    const csv = exportEntriesAsCsv([entry({ localId: "crlf1" })]).replace(/\n/g, "\r\n");
    const imported = importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.localId).toBe("crlf1");
  });

  it("accepts CSV with a leading UTF-8 BOM", () => {
    const csv = `\uFEFF${exportEntriesAsCsv([entry({ localId: "bom-csv" })])}`;
    const imported = importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.localId).toBe("bom-csv");
  });

  it("returns empty array for header-only CSV", () => {
    const csv = exportEntriesAsCsv([]);
    const imported = importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" });
    expect(imported).toHaveLength(0);
  });
});

describe("importEntriesFromCsv — error handling", () => {
  it("throws when required header columns are missing", () => {
    const badCsv = "localId,description\ne1,test";
    expect(() =>
      importEntriesFromCsv({ text: badCsv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/CSV header missing/);
  });

  it("throws on duplicate localId in CSV", () => {
    const csv = exportEntriesAsCsv([entry({ localId: "dup" }), entry({ id: "e-2", localId: "dup" })]);
    expect(() =>
      importEntriesFromCsv({ text: csv, fiscalPeriodId: "fp-1" }),
    ).toThrow(/duplicate localId/);
  });

  it("throws when localId cell is blank", () => {
    const headers = "localId,date,weekday,debit,debitType,debitAmount,credit,creditType,creditAmount,description,partner,businessRate,taxCategory,businessCategory";
    const row = ",2026-01-01,月,現金,asset,1000,売上,revenue,1000,test,,,,";
    expect(() =>
      importEntriesFromCsv({ text: `${headers}\n${row}`, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 2: localId is required/);
  });

  it("throws when a CSV entry date is invalid", () => {
    const headers = "localId,date,weekday,debit,debitType,debitAmount,credit,creditType,creditAmount,description,partner,businessRate,taxCategory,businessCategory";
    const row = "bad-date,2026-13-01,月,現金,asset,1000,売上,revenue,1000,test,,,,";
    expect(() =>
      importEntriesFromCsv({ text: `${headers}\n${row}`, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 2: invalid date \(2026-13-01\)/);
  });
});
