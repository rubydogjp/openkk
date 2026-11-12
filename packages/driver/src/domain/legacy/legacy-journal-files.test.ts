import { describe, expect, it } from "vitest";

import {
  entryRecord,
  type EntryRecordOverrides,
} from "../../../test-support/entry-record.js";
import { AppError } from "../shared/app-error.js";
import {
  assertEntryImportSize,
  decodeJournalImportBytes,
} from "../entries/journal-import-bytes.js";
import {
  exportEntriesAsLegacyJson,
  importEntriesFromLegacyJson,
  importEntriesFromLegacyCsv,
  isLegacyJournalCsv,
} from "./legacy-journal-files.js";
import {
  assertEntryImportItemCount,
  assertEntryImportLineCount,
  assertEntryLineCount,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
  MAX_ENTRY_IMPORT_SIZE,
} from "../entries/entry-limits.js";
import {
  recordToPreviewRows,
  type EntryRecord,
} from "../entries/entry-record.js";

function entry(overrides: EntryRecordOverrides = {}): EntryRecord {
  return entryRecord(overrides, {
    id: "e-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-15",
    weekday: "木",
    debitAmount: "100,000",
    credit: "売上",
    creditType: "revenue",
    creditAmount: "100,000",
    description: "売上入金",
    partner: "取引先A",
    taxCategory: "課税 10%",
    businessCategory: "第5種（サービス業等）",
    localId: "e-1",
  });
}

describe("journal import limits", () => {
  it("rejects oversized files before reading or parsing their contents", () => {
    expect(() => assertEntryImportSize(MAX_ENTRY_IMPORT_SIZE)).not.toThrow();
    expect(() => assertEntryImportSize(MAX_ENTRY_IMPORT_SIZE + 1)).toThrow(
      /size limit/,
    );
  });

  it("rejects malformed UTF-8 instead of silently replacing bytes", () => {
    expect(() => decodeJournalImportBytes(Uint8Array.of(0xc3, 0x28))).toThrow(
      /not valid UTF-8/,
    );
  });

  it("rejects oversized batches before normalizing every row", () => {
    expect(() =>
      assertEntryImportItemCount(MAX_ENTRY_IMPORT_ITEMS),
    ).not.toThrow();
    expect(() =>
      assertEntryImportItemCount(MAX_ENTRY_IMPORT_ITEMS + 1),
    ).toThrow(/too many entries/);
  });

  it("rejects an oversized compound entry before normalizing every line", () => {
    expect(() => assertEntryLineCount(MAX_ENTRY_LINES)).not.toThrow();
    expect(() => assertEntryLineCount(MAX_ENTRY_LINES + 1)).toThrow(
      /too many lines/,
    );
  });

  it("rejects an oversized total across otherwise bounded entries", () => {
    expect(() =>
      assertEntryImportLineCount(MAX_ENTRY_IMPORT_LINES),
    ).not.toThrow();
    expect(() =>
      assertEntryImportLineCount(MAX_ENTRY_IMPORT_LINES + 1),
    ).toThrow(/too many lines/);
  });
});

describe("JSON export/import round-trip", () => {
  it("preserves all fields through export then import", () => {
    const original = [
      entry({
        id: "e-1",
        localId: "sale-jan",
        businessRate: 1 / 3,
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
    const json = exportEntriesAsLegacyJson(original);
    const parsed = JSON.parse(json) as { schema: string; entries: unknown[] };
    expect(parsed.schema).toBe("openkk-journal-v1");
    expect(parsed.entries).toHaveLength(2);

    const imported = importEntriesFromLegacyJson({
      text: json,
      fiscalPeriodId: "fp-2",
    });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.localId).toBe("sale-jan");
    expect(recordToPreviewRows(imported[0]!)[0]?.debit).toBe("普通預金");
    expect(imported[0]?.businessRate).toBe(1 / 3);
    expect(imported[1]?.localId).toBe("rent-jan");
    expect(recordToPreviewRows(imported[1]!)[0]?.debit).toBe("地代家賃");
    expect(imported[0]?.fiscalPeriodId).toBe("fp-2");
  });

  it("falls back to id when localId is null on export", () => {
    const e = entry({ id: "entry-xyz", localId: null });
    const json = exportEntriesAsLegacyJson([e]);
    const parsed = JSON.parse(json) as { entries: Array<{ localId: string }> };
    expect(parsed.entries[0]?.localId).toBe("entry-xyz");
  });

  it("falls back to id when an entry has no localId", () => {
    const e = entry({ id: "entry-blank", localId: null });
    const json = exportEntriesAsLegacyJson([e]);
    const parsed = JSON.parse(json) as { entries: Array<{ localId: string }> };
    expect(parsed.entries[0]?.localId).toBe("entry-blank");
    expect(
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-2" })[0]
        ?.localId,
    ).toBe("entry-blank");
  });

  it("accepts JSON with a leading UTF-8 BOM", () => {
    const imported = importEntriesFromLegacyJson({
      text: `\uFEFF${exportEntriesAsLegacyJson([entry({ localId: "bom-json" })])}`,
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

    const imported = importEntriesFromLegacyJson({
      text: exportEntriesAsLegacyJson([original]),
      fiscalPeriodId: "fp-2",
    });

    expect(imported[0]?.lines).toEqual(original.lines);
  });

  it("preserves simple-entry account and category IDs as exported lines", () => {
    const original = entry({
      debitBookAccountId: "acct_bank_custom",
      creditBookAccountId: "acct_sales_custom",
      debitTaxCategoryId: "tax_debit_custom",
      creditTaxCategoryId: "tax_credit_custom",
      debitBusinessCategoryId: "biz_debit_custom",
      creditBusinessCategoryId: "biz_credit_custom",
    });

    const imported = importEntriesFromLegacyJson({
      text: exportEntriesAsLegacyJson([original]),
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

describe("importEntriesFromLegacyJson — error handling", () => {
  it("throws AppError when JSON cannot be parsed", () => {
    const error = captureError(() =>
      importEntriesFromLegacyJson({ text: "{", fiscalPeriodId: "fp-1" }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain("JSON parse");
    expect((error as AppError).messageForUser).toContain("JSONファイル");
  });

  it("throws when entries array is missing", () => {
    const error = captureError(() =>
      importEntriesFromLegacyJson({
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
        importEntriesFromLegacyJson({ text, fiscalPeriodId: "fp-1" }),
      );

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).messageForDeveloper).toContain("JSON parse");
      expect((error as AppError).messageForUser).toContain("JSONファイル");
    }
  });

  it("throws when entries is not an array", () => {
    expect(() =>
      importEntriesFromLegacyJson({
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
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
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
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toHaveLength(1);
  });

  it("throws on duplicate localId", () => {
    const json = exportEntriesAsLegacyJson([
      entry({ localId: "dup" }),
      entry({ id: "e-2", localId: "dup" }),
    ]);
    expect(() =>
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
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
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
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
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
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
    const [e] = importEntriesFromLegacyJson({
      text: json,
      fiscalPeriodId: "fp-1",
    });
    expect(recordToPreviewRows(e!)[0]?.taxCategory).toBe("対象外");
    expect(recordToPreviewRows(e!)[0]?.businessCategory).toBe("対象外");
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
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: invalid debit amount/);
  });

  it("clamps a percent-only business rate to 0-100", () => {
    const payload = JSON.parse(exportEntriesAsLegacyJson([entry()])) as {
      entries: Array<Record<string, unknown>>;
    };
    payload.entries[0]!.businessRate = "150";
    delete payload.entries[0]!.businessRateRatio;

    const imported = importEntriesFromLegacyJson({
      text: JSON.stringify(payload),
      fiscalPeriodId: "fp-1",
    });

    expect(imported[0]?.businessRate).toBe(1);
  });

  it("rejects an invalid businessRateRatio", () => {
    const payload = JSON.parse(exportEntriesAsLegacyJson([entry()])) as {
      entries: Array<{ businessRateRatio: unknown }>;
    };
    payload.entries[0]!.businessRateRatio = 1.01;

    expect(() =>
      importEntriesFromLegacyJson({
        text: JSON.stringify(payload),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 1: invalid businessRateRatio/);
  });

  it("rejects compound totals outside the safe integer range", () => {
    const amount = String(Number.MAX_SAFE_INTEGER);
    const json = exportEntriesAsLegacyJson([
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
      importEntriesFromLegacyJson({ text: json, fiscalPeriodId: "fp-1" }),
    ).toThrow(/row 1: entry totals exceed the safe integer range/);
  });

  it("rejects non-object entries and malformed compound lines with row context", () => {
    expect(() =>
      importEntriesFromLegacyJson({
        text: JSON.stringify({ entries: [null] }),
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/row 1: entry must be an object/);

    const malformed = JSON.parse(exportEntriesAsLegacyJson([entry()])) as {
      entries: Array<Record<string, unknown>>;
    };
    malformed.entries[0]!.lines = [null];
    expect(() =>
      importEntriesFromLegacyJson({
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
      importEntriesFromLegacyJson({
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

describe("importEntriesFromLegacyCsv", () => {
  const header = [
    "localId",
    "date",
    "weekday",
    "debit",
    "debitType",
    "debitAmount",
    "credit",
    "creditType",
    "creditAmount",
    "description",
    "partner",
    "businessRate",
    "businessRateRatio",
    "taxCategory",
    "businessCategory",
    "lines",
    "openkkSchema",
    "openkkEscapedFields",
  ].join(",");
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [
    {
      side: "debit",
      accountName: "普通預金",
      accountType: "asset",
      amount: "89,790",
      bookAccountId: "acct_bank",
    },
    {
      side: "credit",
      accountName: "売上",
      accountType: "revenue",
      amount: "100,000",
      bookAccountId: "acct_sales",
    },
    {
      side: "debit",
      accountName: "事業主貸",
      accountType: "equity",
      amount: "10,210",
      bookAccountId: "acct_withdrawal",
    },
  ];
  const row = [
    "reward-1",
    "2026-04-25",
    "土",
    "普通預金",
    "asset",
    quote("89,790"),
    "売上",
    "revenue",
    quote("100,000"),
    "'=報酬の入金",
    "△△社",
    "100",
    "1",
    "対象外",
    "対象外",
    quote(JSON.stringify(lines)),
    "openkk-journal-csv-v1",
    quote(JSON.stringify(["description"])),
  ].join(",");

  it("recognises the previous CSV format by its localId column", () => {
    expect(isLegacyJournalCsv(`﻿${header}\n${row}`)).toBe(true);
    expect(
      isLegacyJournalCsv("仕訳番号,日付,借方科目,借方金額,貸方科目,貸方金額"),
    ).toBe(false);
  });

  it("reads every line of a compound entry and undoes the formula protection", () => {
    const [imported] = importEntriesFromLegacyCsv({
      text: `﻿${header}\n${row}\n`,
      fiscalPeriodId: "fp-2",
    });

    expect(imported).toMatchObject({
      localId: "reward-1",
      fiscalPeriodId: "fp-2",
      description: "=報酬の入金",
      businessRate: 1,
    });
    expect(
      imported!.lines.map((line) => [
        line.side,
        line.bookAccountId,
        line.amount,
      ]),
    ).toEqual([
      ["debit", "acct_bank", "89,790"],
      ["credit", "acct_sales", "100,000"],
      ["debit", "acct_withdrawal", "10,210"],
    ]);
  });

  it("asks for the columns it needs", () => {
    expect(() =>
      importEntriesFromLegacyCsv({
        text: "localId,description\ne1,test",
        fiscalPeriodId: "fp-1",
      }),
    ).toThrow(/CSV header missing/);
  });
});
