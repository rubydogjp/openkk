import { describe, expect, it } from "vitest";

import {
  entryRecordToImportPayload,
  replaceFiscalPeriodEntryRecords,
} from "./entries-state";
import type { EntryRecord } from "@rubydogjp/openkk-client-domain";
import type {
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "@rubydogjp/openkk-client-ports";

const accounts: MasterBookAccount[] = [
  { id: "acct_cost_of_sales_商品仕入高", name: "仕入", accountType: "cost_of_sales" },
  { id: "acct_expense_荷造運賃", name: "荷造運賃", accountType: "expense" },
  { id: "acct_accrued_expense", name: "未払金", accountType: "liability" },
];

const taxes: MasterTaxCategory[] = [{ id: "tax_10", name: "課税 10%" }];
const businesses: MasterBusinessCategory[] = [
  { id: "biz_service", name: "第5種（サービス業等）" },
];

function entry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return {
    id: "entry-1",
    fiscalPeriodId: "fp-1",
    date: "2026-09-05",
    weekday: "土",
    debit: "仕入",
    debitType: "cost_of_sales",
    debitAmount: "10,000",
    credit: "未払金",
    creditType: "liability",
    creditAmount: "10,000",
    description: "テスト仕訳",
    partner: "",
    businessRate: "100",
    taxCategory: "課税 10%",
    businessCategory: "第5種（サービス業等）",
    ...overrides,
  };
}

describe("entryRecordToImportPayload", () => {
  it("preserves compound journal lines when importing entries", () => {
    const entry: EntryRecord = {
      id: "entry-1",
      fiscalPeriodId: "fp-1",
      date: "2026-09-05",
      weekday: "土",
      debit: "仕入",
      debitType: "cost_of_sales",
      debitAmount: "168,000",
      credit: "未払金",
      creditType: "liability",
      creditAmount: "210,000",
      description: "秋商材の仕入と配送費",
      partner: "取引先A",
      businessRate: "100",
      taxCategory: "課税 10%",
      businessCategory: "第5種（サービス業等）",
      localId: "compound-1",
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
        taxCategoryName: "tax_10",
        businessCategoryName: "biz_service",
      },
      {
        side: "debit",
        bookAccountId: "acct_expense_荷造運賃",
        amount: 42000,
        partnerName: "取引先A",
        taxCategoryName: "tax_10",
        businessCategoryName: "biz_service",
      },
      {
        side: "credit",
        bookAccountId: "acct_accrued_expense",
        amount: 210000,
        partnerName: "取引先A",
        taxCategoryName: "tax_10",
        businessCategoryName: "biz_service",
      },
    ]);
  });

  it("clamps imported business-use rates to 0-100 percent", () => {
    const entry: EntryRecord = {
      id: "entry-1",
      fiscalPeriodId: "fp-1",
      date: "2026-09-05",
      weekday: "土",
      debit: "仕入",
      debitType: "cost_of_sales",
      debitAmount: "10,000",
      credit: "未払金",
      creditType: "liability",
      creditAmount: "10,000",
      description: "事業割合のテスト",
      partner: "",
      businessRate: "150",
      taxCategory: "課税 10%",
      businessCategory: "第5種（サービス業等）",
      localId: "rate-1",
      debitBookAccountId: "acct_cost_of_sales_商品仕入高",
      creditBookAccountId: "acct_accrued_expense",
    };

    const payload = entryRecordToImportPayload(entry, {
      accounts,
      taxes,
      businesses,
    });

    expect(payload.businessRate).toBe(1);
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
