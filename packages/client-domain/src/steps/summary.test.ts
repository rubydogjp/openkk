import { describe, expect, it } from "vitest";

import {
  computeExpenseContribution,
  computeRevenueContribution,
  parseAmount,
  parseBusinessRate,
  summarizeOpeningBalances,
  type EntrySummaryRow,
} from "./summary";
import {
  buildBusinessRateTransferEntry,
  excludeBusinessRateTransfer,
  type EntryRecord,
} from "../entries/entry-record";

function plTotals(rows: EntrySummaryRow[]): {
  revenue: number;
  expenses: number;
} {
  let revenue = 0;
  let expenses = 0;
  for (const row of rows) {
    const rate = parseBusinessRate(row.businessRate);
    revenue += computeRevenueContribution(row, rate);
    expenses += computeExpenseContribution(row, rate);
  }
  return { revenue, expenses };
}

describe("summary contributions", () => {
  it("parses user-entered rates and amounts defensively", () => {
    expect(parseBusinessRate("")).toBe(1);
    expect(parseBusinessRate("50")).toBe(0.5);
    expect(parseBusinessRate("150")).toBe(1);
    expect(parseBusinessRate("-10")).toBe(0);
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("")).toBe(0);
  });

  it("aggregates revenue and expense contributions per entry (incl. contra lines)", () => {
    const totals = plTotals([
      entry({ creditType: "revenue", creditAmount: "100,000" }),
      entry({ debitType: "cost_of_sales", debitAmount: "30,000" }),
      entry({
        businessRate: "50",
        debitType: "expense",
        debitAmount: "20,000",
      }),
      entry({ debitType: "revenue", debitAmount: "5,000" }),
      entry({ creditType: "expense", creditAmount: "2,000" }),
    ]);

    expect(totals).toEqual({ revenue: 95_000, expenses: 38_000 });
  });

  it("routes the home-use portion out of the expense contribution (家事按分)", () => {
    // 20,000 の事業割合 50% → 事業分 10,000 のみが費用、残り 10,000 は事業主貸(資産)。
    const expense = computeExpenseContribution(
      entry({ debitType: "expense", debitAmount: "20,000" }),
      parseBusinessRate("50"),
    );
    expect(expense).toBe(10_000);
  });

  it("aggregates every line in compound entries", () => {
    const compound = entry({
      lines: [
        {
          side: "debit",
          accountName: "仕入",
          accountType: "cost_of_sales",
          amount: "168,000",
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
        },
      ],
    });

    expect(plTotals([compound])).toEqual({ revenue: 0, expenses: 210_000 });
  });

  it("classifies opening balance lines into assets, liabilities, and equity", () => {
    expect(
      summarizeOpeningBalances([
        { accountId: "a:現金", amount: 320_000 },
        { accountId: "a:売掛金", amount: 240_000 },
        { accountId: "l:借入金", amount: 600_000 },
        { accountId: "l:買掛金", amount: 120_000 },
        { accountId: "l:元入金", amount: 1_834_000 },
        { accountId: "l:事業主借", amount: 50_000 },
      ]),
    ).toEqual({
      assets: 560_000,
      liabilities: 720_000,
      equity: 1_884_000,
    });
  });

  it("excludes the materialized 家事按分振替 so live totals never double-count", () => {
    const realEntries: EntryRecord[] = [
      record({
        debit: "普通預金",
        debitType: "asset",
        debitAmount: "300,000",
        credit: "売上",
        creditType: "revenue",
        creditAmount: "300,000",
      }),
      record({
        debit: "地代家賃",
        debitType: "expense",
        debitAmount: "20,000",
        credit: "普通預金",
        creditType: "asset",
        creditAmount: "20,000",
        businessRate: "50",
      }),
    ];
    const transfer = buildBusinessRateTransferEntry({
      fiscalPeriodId: "fp-2026",
      entries: realEntries,
      date: "2026-12-31",
    });
    expect(transfer).not.toBeNull();

    const baseline = plTotals(realEntries);
    const afterClosing = plTotals(
      excludeBusinessRateTransfer([...realEntries, transfer!]),
    );
    expect(afterClosing).toEqual(baseline);
    expect(baseline).toEqual({ revenue: 300_000, expenses: 10_000 });
  });
});

function entry(overrides: Partial<EntrySummaryRow>): EntrySummaryRow {
  return {
    businessRate: "",
    debitType: "asset",
    debitAmount: "0",
    creditType: "asset",
    creditAmount: "0",
    ...overrides,
  };
}

function record(overrides: Partial<EntryRecord>): EntryRecord {
  return {
    id: "entry-1",
    fiscalPeriodId: "fp-2026",
    date: "2026-03-01",
    weekday: "",
    debit: "普通預金",
    debitType: "asset",
    debitAmount: "0",
    credit: "普通預金",
    creditType: "asset",
    creditAmount: "0",
    description: "test",
    partner: "",
    businessRate: "",
    taxCategory: "対象外",
    businessCategory: "",
    ...overrides,
  };
}
