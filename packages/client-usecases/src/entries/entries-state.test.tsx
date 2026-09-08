import { describe, expect, it } from "vitest";

import {
  entryRecordToImportPayload,
  optionalEntryLocalId,
  resolveBookAccountId,
} from "./import-mapping.js";
import {
  earliestEntryDate,
  removeEntryRecord,
  replaceFiscalPeriodEntryRecords,
  upsertEntryRecord,
} from "./entry-record-state.js";
import type { EntryRecord } from "@rubydogjp/openkk-client-domain";
import type {
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "@rubydogjp/openkk-client-ports";

const accounts: Pick<MasterBookAccount, "id" | "name" | "accountType">[] = [
  {
    id: "acct_cost_of_sales_商品仕入高",
    name: "仕入",
    accountType: "cost_of_sales",
  },
  { id: "acct_expense_荷造運賃", name: "荷造運賃", accountType: "expense" },
  { id: "acct_accrued_expense", name: "未払金", accountType: "liability" },
];

const taxes: Pick<MasterTaxCategory, "id" | "name">[] = [
  { id: "tax_10", name: "課税 10%" },
  { id: "tax_8", name: "軽減税率 8%" },
];
const businesses: Pick<MasterBusinessCategory, "id" | "name">[] = [
  { id: "biz_service", name: "第5種（サービス業等）" },
  { id: "biz_retail", name: "第2種（小売業等）" },
];

function entry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  const base: EntryRecord = {
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
    lines: null,
    businessRateRatio: null,
    localId: null,
    debitBookAccountId: null,
    creditBookAccountId: null,
    debitTaxCategoryId: null,
    creditTaxCategoryId: null,
    debitBusinessCategoryId: null,
    creditBusinessCategoryId: null,
  };
  return Object.assign(base, overrides);
}

describe("entryRecordToImportPayload", () => {
  it("nulls out an empty backend localId in update/import payloads", () => {
    expect(optionalEntryLocalId("")).toBeNull();
    expect(optionalEntryLocalId("   ")).toBeNull();
    expect(optionalEntryLocalId(null)).toBeNull();
    expect(optionalEntryLocalId("entry-key")).toBe("entry-key");

    const payload = entryRecordToImportPayload(entry({ localId: "" }), {
      accounts,
      taxes,
      businesses,
    });

    expect(payload.localId).toBeNull();
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
          id: null,
          partnerName: null,
          taxCategoryId: null,
          taxCategoryName: null,
          businessCategoryId: null,
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
      businessRateRatio: null,
      debitBookAccountId: null,
      creditBookAccountId: null,
      debitTaxCategoryId: null,
      creditTaxCategoryId: null,
      debitBusinessCategoryId: null,
      creditBusinessCategoryId: null,
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
      lines: null,
      businessRateRatio: null,
      debitTaxCategoryId: null,
      creditTaxCategoryId: null,
      debitBusinessCategoryId: null,
      creditBusinessCategoryId: null,
    };

    const payload = entryRecordToImportPayload(entry, {
      accounts,
      taxes,
      businesses,
    });

    expect(payload.businessRate).toBe(1);
  });

  it("preserves an exact backend rate instead of its rounded display value", () => {
    const payload = entryRecordToImportPayload(
      entry({
        businessRate: "33.33",
        businessRateRatio: 0.3333333333333333,
      }),
      { accounts, taxes, businesses },
    );

    expect(payload.businessRate).toBe(0.3333333333333333);
  });

  it("preserves line-specific metadata instead of replacing it with header values", () => {
    const payload = entryRecordToImportPayload(
      entry({
        partner: "header partner",
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
            partnerName: null,
            taxCategoryId: null,
            taxCategoryName: null,
            businessCategoryId: null,
            businessCategoryName: null,
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

describe("resolveBookAccountId", () => {
  const duplicateAccounts: Pick<
    MasterBookAccount,
    "id" | "name" | "accountType"
  >[] = [
    { id: "deferred-current", name: "繰延税金資産", accountType: "asset" },
    { id: "deferred-fixed", name: "繰延税金資産", accountType: "asset" },
  ];

  it("uses a valid explicit id for same-name accounts", () => {
    expect(
      resolveBookAccountId({
        explicitId: "deferred-fixed",
        accountName: "繰延税金資産",
        accountType: "asset",
        accounts: duplicateAccounts,
      }),
    ).toBe("deferred-fixed");
  });

  it("rejects an ambiguous name-only fallback", () => {
    expect(
      resolveBookAccountId({
        accountName: "繰延税金資産",
        accountType: "asset",
        accounts: duplicateAccounts,
        explicitId: null,
      }),
    ).toBeNull();
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
