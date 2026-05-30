import { parseAmount, parseBusinessRate } from "../shared/parse-utils";
export { parseAmount, parseBusinessRate } from "../shared/parse-utils";

type EntrySummaryRow = {
  businessRate: string;
  debitType: string;
  debitAmount: string;
  creditType: string;
  creditAmount: string;
};

export function computeRevenueContribution(
  record: EntrySummaryRow,
  rate: number,
): number {
  const debit = Math.round(parseAmount(record.debitAmount) * rate);
  const credit = Math.round(parseAmount(record.creditAmount) * rate);
  let v = 0;
  if (record.creditType === "revenue") v += credit;
  if (record.debitType === "revenue") v -= debit;
  return v;
}

export function computeExpenseContribution(
  record: EntrySummaryRow,
  rate: number,
): number {
  const debit = Math.round(parseAmount(record.debitAmount) * rate);
  const credit = Math.round(parseAmount(record.creditAmount) * rate);
  let v = 0;
  if (record.debitType === "expense" || record.debitType === "cost_of_sales") v += debit;
  if (record.creditType === "expense" || record.creditType === "cost_of_sales") v -= credit;
  return v;
}

export function computeFinancialSummary(entries: EntrySummaryRow[]): {
  revenue: number;
  expenses: number;
  profit: number;
} {
  let revenue = 0;
  let expenses = 0;
  for (const entry of entries) {
    const rate = parseBusinessRate(entry.businessRate);
    revenue += computeRevenueContribution(entry, rate);
    expenses += computeExpenseContribution(entry, rate);
  }
  return { revenue, expenses, profit: revenue - expenses };
}

export function computeBSSummary(
  entries: EntrySummaryRow[],
  openingAssets: number,
  openingCreditTotal: number,
  profit: number,
): { assets: number; liabilities: number; equity: number } {
  let netAssetChange = 0;
  let netLiabilityChange = 0;
  for (const entry of entries) {
    const rate = parseBusinessRate(entry.businessRate);
    const dAmt = Math.round(parseAmount(entry.debitAmount) * rate);
    const cAmt = Math.round(parseAmount(entry.creditAmount) * rate);
    if (entry.debitType === "asset") netAssetChange += dAmt;
    if (entry.creditType === "asset") netAssetChange -= cAmt;
    if (entry.creditType === "liability") netLiabilityChange += cAmt;
    if (entry.debitType === "liability") netLiabilityChange -= dAmt;
  }
  // rough 50/50 split: no per-account breakdown available at this call site
  const openingLiabilities = Math.round(openingCreditTotal * 0.5);
  const openingEquity = openingCreditTotal - openingLiabilities;
  return {
    assets: Math.max(0, openingAssets + netAssetChange),
    liabilities: Math.max(0, openingLiabilities + netLiabilityChange),
    equity: Math.max(0, openingEquity + profit),
  };
}
