import { describe, expect, it } from "vitest";

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
});

describe("importEntriesFromJson — error handling", () => {
  it("throws when entries array is missing", () => {
    expect(() =>
      importEntriesFromJson({ text: JSON.stringify({ schema: "openkk-journal-v1" }), fiscalPeriodId: "fp-1" }),
    ).toThrow("entries array not found");
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

  it("normalises missing optional fields to safe defaults", () => {
    const json = JSON.stringify({
      entries: [{ localId: "e1", date: "2026-03-05", debit: "現金", debitType: "asset", debitAmount: "5000", credit: "売上", creditType: "revenue", creditAmount: "5000", description: "", partner: "", businessRate: "", taxCategory: "", businessCategory: "" }],
    });
    const [e] = importEntriesFromJson({ text: json, fiscalPeriodId: "fp-1" });
    expect(e?.taxCategory).toBe("対象外");
    expect(e?.businessCategory).toBe("対象外");
    expect(e?.weekday).toBeTruthy();
  });
});

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
});
