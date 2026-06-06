import { parseAmount, parseBusinessRate } from "../shared/parse-utils";
import {
  applyBusinessRateToLines,
  type EntryLine,
} from "../entries/entry-record";
import type { EntryAccountVisualType } from "../entries/entries-types";
export { parseAmount, parseBusinessRate } from "../shared/parse-utils";

export type EntrySummaryRow = {
  businessRate: string;
  debitType: string;
  debitAmount: string;
  creditType: string;
  creditAmount: string;
  lines?: EntryLine[];
};

function summaryRowLines(record: EntrySummaryRow): EntryLine[] {
  if (record.lines != null && record.lines.length > 0) return record.lines;
  return [
    {
      side: "debit",
      accountName: "",
      accountType: record.debitType as EntryAccountVisualType,
      amount: record.debitAmount,
    },
    {
      side: "credit",
      accountName: "",
      accountType: record.creditType as EntryAccountVisualType,
      amount: record.creditAmount,
    },
  ];
}

/** 家事按分（個人分を事業主貸/借へ振替）を反映した実効明細。 */
function adjustedLines(record: EntrySummaryRow, rate: number): EntryLine[] {
  return applyBusinessRateToLines(summaryRowLines(record), rate);
}

export function computeRevenueContribution(
  record: EntrySummaryRow,
  rate: number,
): number {
  let value = 0;
  for (const line of adjustedLines(record, rate)) {
    if (line.accountType !== "revenue") continue;
    const amount = parseAmount(line.amount);
    value += line.side === "credit" ? amount : -amount;
  }
  return value;
}

export function computeExpenseContribution(
  record: EntrySummaryRow,
  rate: number,
): number {
  let value = 0;
  for (const line of adjustedLines(record, rate)) {
    if (
      line.accountType !== "expense" &&
      line.accountType !== "cost_of_sales"
    ) {
      continue;
    }
    const amount = parseAmount(line.amount);
    value += line.side === "debit" ? amount : -amount;
  }
  return value;
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
    const lines = adjustedLines(entry, parseBusinessRate(entry.businessRate));
    for (const line of lines) {
      const amount = parseAmount(line.amount);
      if (line.accountType === "asset") {
        netAssetChange += line.side === "debit" ? amount : -amount;
      }
      if (line.accountType === "liability") {
        netLiabilityChange += line.side === "credit" ? amount : -amount;
      }
    }
  }
  return {
    assets: Math.max(0, opening.assets + netAssetChange),
    liabilities: Math.max(0, opening.liabilities + netLiabilityChange),
    equity: Math.max(0, opening.equity + profit),
  };
}
