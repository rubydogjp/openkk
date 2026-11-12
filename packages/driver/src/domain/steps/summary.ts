import { parseAmount } from "../shared/parse-utils.js";
import {
  applyBusinessRateToLines,
  type EntryLine,
} from "../entries/entry-record.js";

export type EntrySummaryRow = {
  businessRate: number;
  lines: EntryLine[];
};

function businessRateAdjustedLines(record: EntrySummaryRow): EntryLine[] {
  return applyBusinessRateToLines(record.lines, record.businessRate);
}

export function computeRevenueContribution(record: EntrySummaryRow): number {
  let value = 0;
  for (const line of businessRateAdjustedLines(record)) {
    if (line.accountType !== "revenue") continue;
    const amount = parseAmount(line.amount);
    value += line.side === "credit" ? amount : -amount;
  }
  return value;
}

export function computeExpenseContribution(record: EntrySummaryRow): number {
  let value = 0;
  for (const line of businessRateAdjustedLines(record)) {
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
