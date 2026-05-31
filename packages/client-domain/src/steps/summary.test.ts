import { describe, expect, it } from "vitest";

import {
  computeBSSummary,
  computeFinancialSummary,
  parseAmount,
  parseBusinessRate,
  summarizeOpeningBalances,
} from "./summary";

describe("financial summary", () => {
  it("parses user-entered rates and amounts defensively", () => {
    expect(parseBusinessRate("")).toBe(1);
    expect(parseBusinessRate("50")).toBe(0.5);
    expect(parseBusinessRate("150")).toBe(1);
    expect(parseBusinessRate("-10")).toBe(0);
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("")).toBe(0);
  });

  it("aggregates revenue, expenses, and profit from actual entry rows", () => {
    const summary = computeFinancialSummary([
      entry({ creditType: "revenue", creditAmount: "100,000" }),
      entry({ debitType: "cost_of_sales", debitAmount: "30,000" }),
      entry({ businessRate: "50", debitType: "expense", debitAmount: "20,000" }),
      entry({ debitType: "revenue", debitAmount: "5,000" }),
      entry({ creditType: "expense", creditAmount: "2,000" }),
    ]);

    expect(summary).toEqual({
      revenue: 95_000,
      expenses: 38_000,
      profit: 57_000,
    });
  });

  it("aggregates balance sheet movement with business-use rates", () => {
    const summary = computeBSSummary(
      [
        entry({ debitType: "asset", debitAmount: "100,000" }),
        entry({ creditType: "asset", creditAmount: "30,000" }),
        entry({ businessRate: "50", creditType: "liability", creditAmount: "20,000" }),
      ],
      { assets: 50_000, liabilities: 20_000, equity: 20_000 },
      57_000,
    );

    expect(summary).toEqual({
      assets: 120_000,
      liabilities: 30_000,
      equity: 77_000,
    });
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
});

function entry(
  overrides: Partial<Parameters<typeof computeFinancialSummary>[0][number]>,
): Parameters<typeof computeFinancialSummary>[0][number] {
  return {
    businessRate: "",
    debitType: "asset",
    debitAmount: "0",
    creditType: "asset",
    creditAmount: "0",
    ...overrides,
  };
}
