import { describe, expect, it } from "vitest";

import {
  entryRecordToImportPayload,
} from "./import-mapping.js";
import {
  earliestEntryDate,
  removeEntryRecord,
  replaceFiscalPeriodEntryRecords,
  upsertEntryRecord,
} from "./entry-record-state.js";
import type {
  BookAccountType,
  EntryLine,
  EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  MasterBookAccountApiRecord,
  MasterBusinessCategoryApiRecord,
  MasterTaxCategoryApiRecord,
} from "@rubydogjp/openkk-client-ports";

const accounts: Pick<
  MasterBookAccountApiRecord,
  "id" | "name" | "accountType"
>[] = [
  {
    id: "acct_cost_of_sales_商品仕入高",
    name: "仕入",
    accountType: "cost_of_sales",
  },
  { id: "acct_expense_荷造運賃", name: "荷造運賃", accountType: "expense" },
  { id: "acct_accrued_expense", name: "未払金", accountType: "liability" },
];

const taxes: Pick<MasterTaxCategoryApiRecord, "id" | "name">[] = [
  { id: "tax_10", name: "課税 10%" },
  { id: "tax_8", name: "軽減税率 8%" },
];
const businesses: Pick<MasterBusinessCategoryApiRecord, "id" | "name">[] = [
  { id: "biz_service", name: "第5種（サービス業等）" },
  { id: "biz_retail", name: "第2種（小売業等）" },
];

type EntryInput = Partial<
  Omit<EntryRecord, "lines"> & {
    lines: EntryLine[];
    debit: string;
    debitType: BookAccountType;
    debitAmount: string;
    credit: string;
    creditType: BookAccountType;
    creditAmount: string;
    partner: string;
    taxCategory: string;
    businessCategory: string;
    debitBookAccountId: string | null;
    creditBookAccountId: string | null;
  }
>;

function entry(input: EntryInput = {}): EntryRecord {
  const partner = input.partner ?? "";
  const taxCategory = input.taxCategory ?? "課税 10%";
  const businessCategory =
    input.businessCategory ?? "第5種（サービス業等）";
  const line = (side: EntryLine["side"]): EntryLine => {
    const debit = side === "debit";
    return {
      id: null,
      side,
      accountName: debit
        ? (input.debit ?? "仕入")
        : (input.credit ?? "未払金"),
      accountType: debit
        ? (input.debitType ?? "cost_of_sales")
        : (input.creditType ?? "liability"),
      amount: debit
        ? (input.debitAmount ?? "10,000")
        : (input.creditAmount ?? "10,000"),
      bookAccountId: debit
        ? (input.debitBookAccountId ?? null)
        : (input.creditBookAccountId ?? null),
      partnerName: partner,
      taxCategoryId: null,
      taxCategoryName: taxCategory,
      businessCategoryId: null,
      businessCategoryName: businessCategory,
    };
  };
  return {
    id: input.id ?? "entry-1",
    fiscalPeriodId: input.fiscalPeriodId ?? "fp-1",
    date: input.date ?? "2026-09-05",
    weekday: input.weekday ?? "土",
    description: input.description ?? "テスト仕訳",
    businessRate: input.businessRate ?? 1,
    localId: input.localId ?? null,
    lines: input.lines ?? [line("debit"), line("credit")],
  };
}

describe("entryRecordToImportPayload", () => {
  it("rejects an unknown account id even when its display name matches", () => {
    expect(() => entryRecordToImportPayload(entry({
      debitBookAccountId: "unknown",
    }), { accounts, taxes, businesses })).toThrow("entries.import: unresolved bookAccountId");
  });

  it("preserves unknown explicit category ids for backend validation", () => {
    const record = entry({});
    record.lines = record.lines.map((line) => ({
      ...line,
      taxCategoryId: "unknown_tax",
      taxCategoryName: "",
      businessCategoryId: "unknown_business",
      businessCategoryName: "第5種（サービス業等）",
    }));
    const payload = entryRecordToImportPayload(record, {
      accounts,
      taxes,
      businesses,
    });
    expect(payload.lines).toEqual(
      record.lines.map((line) => expect.objectContaining({
        taxCategoryId: line.taxCategoryId,
        businessCategoryId: line.businessCategoryId,
      })),
    );
  });

  it("maps a blank tax category to out-of-scope taxation", () => {
    const payload = entryRecordToImportPayload(entry({ taxCategory: "" }), {
      accounts,
      taxes,
      businesses,
    });

    expect(payload.lines.map((line) => line.taxCategoryId)).toEqual([
      "tax_out_of_scope",
      "tax_out_of_scope",
    ]);
  });

  it("preserves compound journal lines when importing entries", () => {
    const entry: EntryRecord = {
      id: "entry-1",
      fiscalPeriodId: "fp-1",
      date: "2026-09-05",
      weekday: "土",
      description: "秋商材の仕入と配送費",
      businessRate: 1,
      localId: "compound-1",
      lines: [
        {
          side: "debit",
          accountName: "仕入",
          accountType: "cost_of_sales",
          amount: "168,000",
          bookAccountId: "acct_cost_of_sales_商品仕入高",
          id: null,
          partnerName: "取引先A",
          taxCategoryId: null,
          taxCategoryName: "課税 10%",
          businessCategoryId: null,
          businessCategoryName: "第5種（サービス業等）",
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
          bookAccountId: "acct_expense_荷造運賃",
          id: null,
          partnerName: "取引先A",
          taxCategoryId: null,
          taxCategoryName: "課税 10%",
          businessCategoryId: null,
          businessCategoryName: "第5種（サービス業等）",
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
          bookAccountId: "acct_accrued_expense",
          id: null,
          partnerName: "取引先A",
          taxCategoryId: null,
          taxCategoryName: "課税 10%",
          businessCategoryId: null,
          businessCategoryName: "第5種（サービス業等）",
        },
      ],
    };

    const payload = entryRecordToImportPayload(entry, {
      accounts,
      taxes,
      businesses,
    });

    expect(payload.lines).toEqual([
      {
        side: "debit",
        bookAccountId: "acct_cost_of_sales_商品仕入高",
        amount: 168000,
        partnerName: "取引先A",
        taxCategoryId: "tax_10",
        businessCategoryId: "biz_service",
      },
      {
        side: "debit",
        bookAccountId: "acct_expense_荷造運賃",
        amount: 42000,
        partnerName: "取引先A",
        taxCategoryId: "tax_10",
        businessCategoryId: "biz_service",
      },
      {
        side: "credit",
        bookAccountId: "acct_accrued_expense",
        amount: 210000,
        partnerName: "取引先A",
        taxCategoryId: "tax_10",
        businessCategoryId: "biz_service",
      },
    ]);
  });

  it("passes a full-precision rate through unchanged", () => {
    const payload = entryRecordToImportPayload(
      entry({
        businessRate: 0.3333333333333333,
      }),
      { accounts, taxes, businesses },
    );

    expect(payload.businessRate).toBe(0.3333333333333333);
  });

  it("preserves line-specific metadata instead of replacing it with header values", () => {
    const payload = entryRecordToImportPayload(
      entry({
        lines: [
          {
            side: "debit",
            accountName: "仕入",
            accountType: "cost_of_sales",
            amount: "10,000",
            bookAccountId: "acct_cost_of_sales_商品仕入高",
            partnerName: "line partner",
            taxCategoryId: "tax_8",
            businessCategoryId: "biz_retail",
            id: null,
            taxCategoryName: null,
            businessCategoryName: null,
          },
          {
            side: "credit",
            accountName: "未払金",
            accountType: "liability",
            amount: "10,000",
            bookAccountId: "acct_accrued_expense",
            id: null,
            partnerName: "header partner",
            taxCategoryId: null,
            taxCategoryName: "課税 10%",
            businessCategoryId: null,
            businessCategoryName: "第5種（サービス業等）",
          },
        ],
      }),
      { accounts, taxes, businesses },
    );

    expect(payload.lines).toEqual([
      expect.objectContaining({
        partnerName: "line partner",
        taxCategoryId: "tax_8",
        businessCategoryId: "biz_retail",
      }),
      expect.objectContaining({
        partnerName: "header partner",
        taxCategoryId: "tax_10",
        businessCategoryId: "biz_service",
      }),
    ]);
  });
});



describe("earliestEntryDate", () => {
  it("uses only records actually inserted by the backend", () => {
    const inserted = [
      entry({ id: "new-december", date: "2026-12-20" }),
      entry({ id: "new-october", date: "2026-10-05" }),
    ];

    expect(earliestEntryDate(inserted)).toBe("2026-10-05");
    expect(earliestEntryDate([])).toBeNull();
  });
});

describe("replaceFiscalPeriodEntryRecords", () => {
  it("replaces only the loaded fiscal period entries", () => {
    const current = [
      entry({ id: "old-fp-1", fiscalPeriodId: "fp-1" }),
      entry({ id: "keep-fp-2", fiscalPeriodId: "fp-2" }),
    ];
    const next = [entry({ id: "new-fp-1", fiscalPeriodId: "fp-1" })];

    expect(replaceFiscalPeriodEntryRecords(current, "fp-1", next)).toEqual([
      current[1],
      next[0],
    ]);
  });

  it("clears cached entries when no fiscal period is selected", () => {
    const current = [
      entry({ id: "old-fp-1", fiscalPeriodId: "fp-1" }),
      entry({ id: "old-fp-2", fiscalPeriodId: "fp-2" }),
    ];

    expect(replaceFiscalPeriodEntryRecords(current, null, [])).toEqual([]);
    expect(replaceFiscalPeriodEntryRecords(current, "", [])).toEqual([]);
  });
});

describe("removeEntryRecord", () => {
  it("removes only the requested entry", () => {
    const current = [
      entry({ id: "entry-1", fiscalPeriodId: "fp-1" }),
      entry({ id: "entry-2", fiscalPeriodId: "fp-1" }),
    ];

    expect(removeEntryRecord(current, "entry-1")).toEqual([current[1]]);
  });

  it("leaves records unchanged when the entry is absent", () => {
    const current = [entry({ id: "entry-1", fiscalPeriodId: "fp-1" })];

    expect(removeEntryRecord(current, "missing")).toEqual(current);
  });
});

describe("upsertEntryRecord", () => {
  it("replaces an existing record instead of duplicating an async result", () => {
    const current = [entry({ id: "entry-1", description: "old" })];
    const next = entry({ id: "entry-1", description: "new" });

    expect(upsertEntryRecord(current, next)).toEqual([next]);
  });

  it("appends a previously unseen record", () => {
    const current = [entry({ id: "entry-1" })];
    const next = entry({ id: "entry-2" });

    expect(upsertEntryRecord(current, next)).toEqual([current[0], next]);
  });
});
