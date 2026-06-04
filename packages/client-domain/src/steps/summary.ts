import { parseAmount, parseBusinessRate } from "../shared/parse-utils";
import type { EntryLine } from "../entries/entry-record";
export { parseAmount, parseBusinessRate } from "../shared/parse-utils";

type EntrySummaryRow = {
  businessRate: string;
  debitType: string;
  debitAmount: string;
  creditType: string;
  creditAmount: string;
  lines?: EntryLine[];
};

export function computeRevenueContribution(
  record: EntrySummaryRow,
  rate: number,
): number {
  if (record.lines != null && record.lines.length > 0) {
    let value = 0;
    for (const line of record.lines) {
      const amount = Math.round(parseAmount(line.amount) * rate);
      if (line.accountType !== "revenue") continue;
      value += line.side === "credit" ? amount : -amount;
    }
    return value;
  }
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
  if (record.lines != null && record.lines.length > 0) {
    let value = 0;
    for (const line of record.lines) {
      const amount = Math.round(parseAmount(line.amount) * rate);
      if (line.accountType !== "expense" && line.accountType !== "cost_of_sales")
        continue;
      value += line.side === "debit" ? amount : -amount;
    }
    return value;
  }
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

export type OpeningBalanceSummary = {
  assets: number;
  liabilities: number;
  equity: number;
};

/**
 * 期首残高ラインの credit 側（accountId が "l:" 始まり）のうち、純資産（資本）に
 * 区分するラベル。それ以外の credit 側は負債。期首残高の accountId は
 * "a:資産名" / "l:負債・資本名" という規約で、amount は常に正値。
 */
export const OPENING_EQUITY_LABELS = new Set<string>(["事業主借", "元入金"]);

/** 期首残高ラインを資産 / 負債 / 資本に集計する。 */
export function summarizeOpeningBalances(
  lines: Array<{ accountId: string; amount: number }>,
): OpeningBalanceSummary {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  for (const line of lines) {
    const amount = Math.abs(line.amount);
    if (line.accountId.startsWith("a:")) {
      assets += amount;
    } else if (line.accountId.startsWith("l:")) {
      const label = line.accountId.slice(2);
      if (OPENING_EQUITY_LABELS.has(label)) equity += amount;
      else liabilities += amount;
    }
  }
  return { assets, liabilities, equity };
}

export function computeBSSummary(
  entries: EntrySummaryRow[],
  opening: OpeningBalanceSummary,
  profit: number,
): { assets: number; liabilities: number; equity: number } {
  let netAssetChange = 0;
  let netLiabilityChange = 0;
  for (const entry of entries) {
    const rate = parseBusinessRate(entry.businessRate);
    if (entry.lines != null && entry.lines.length > 0) {
      for (const line of entry.lines) {
        const amount = Math.round(parseAmount(line.amount) * rate);
        if (line.accountType === "asset") {
          netAssetChange += line.side === "debit" ? amount : -amount;
        }
        if (line.accountType === "liability") {
          netLiabilityChange += line.side === "credit" ? amount : -amount;
        }
      }
      continue;
    }
    const dAmt = Math.round(parseAmount(entry.debitAmount) * rate);
    const cAmt = Math.round(parseAmount(entry.creditAmount) * rate);
    if (entry.debitType === "asset") netAssetChange += dAmt;
    if (entry.creditType === "asset") netAssetChange -= cAmt;
    if (entry.creditType === "liability") netLiabilityChange += cAmt;
    if (entry.debitType === "liability") netLiabilityChange -= dAmt;
  }
  return {
    assets: Math.max(0, opening.assets + netAssetChange),
    liabilities: Math.max(0, opening.liabilities + netLiabilityChange),
    equity: Math.max(0, opening.equity + profit),
  };
}
