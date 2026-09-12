import { parseAmount } from "../shared/parse-utils.js";
import {
  applyBusinessRateToLines,
  type EntryLine,
} from "../entries/entry-record.js";
export { parseAmount, parseBusinessRate } from "../shared/parse-utils.js";

export type EntrySummaryRow = {
  businessRate: number;
  lines: EntryLine[];
};

function businessRateAdjustedLines(
  record: EntrySummaryRow,
  rate: number,
): EntryLine[] {
  return applyBusinessRateToLines(record.lines, rate);
}

export function computeRevenueContribution(
  record: EntrySummaryRow,
  rate: number,
): number {
  let value = 0;
  for (const line of businessRateAdjustedLines(record, rate)) {
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
  for (const line of businessRateAdjustedLines(record, rate)) {
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

export type OpeningBalanceSummary = {
  assets: number;
  liabilities: number;
  equity: number;
};

export const OPENING_EQUITY_LABELS = new Set<string>(["事業主借", "元入金"]);

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
