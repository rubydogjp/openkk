import type { EntryLine, EntryRecord } from "../entries/entry-record.js";
import { parseAmount, parseIsoLocalDate } from "../shared/parse-utils.js";

export type NextFiscalPeriodSuggestion = {
  name: string;
  startDate: string;
  endDate: string;
};

export function buildNextFiscalPeriodSuggestion(
  previousEndDate: string,
): NextFiscalPeriodSuggestion {
  const startDate = addDaysToIsoDate(previousEndDate, 1) ?? previousEndDate;
  const endDate = addYearsToIsoDate(previousEndDate, 1) ?? previousEndDate;
  return {
    name: `${endDate.slice(0, 4)}年分`,
    startDate,
    endDate,
  };
}

function addDaysToIsoDate(value: string, days: number): string | null {
  const date = parseIsoLocalDate(value);
  if (date == null) return null;
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const REVERSIBLE_BALANCE_ACCOUNTS = new Set([
  "未収入金",
  "未収収益",
  "前払金",
  "前払費用",
  "棚卸資産",
  "商品",
  "製品",
  "原材料",
  "仕掛品",
  "貯蔵品",
  "未払金",
  "未払費用",
  "前受金",
  "前受収益",
]);

const PROFIT_LOSS_TYPES = new Set(["revenue", "expense", "cost_of_sales"]);

export function isOpeningCarryoverCandidate(entry: EntryRecord): boolean {
  return (
    areEntryLinesBalanced(entry.lines) &&
    entry.lines.some(
      (balance) =>
        isReversibleBalanceLine(balance) &&
        parseAmount(balance.amount) > 0 &&
        entry.lines.some(
          (line) =>
            PROFIT_LOSS_TYPES.has(line.accountType) &&
            parseAmount(line.amount) > 0 &&
            line.side !== balance.side,
        ),
    )
  );
}

function isReversibleBalanceLine(line: EntryLine): boolean {
  return (
    (line.accountType === "asset" || line.accountType === "liability") &&
    REVERSIBLE_BALANCE_ACCOUNTS.has(line.accountName)
  );
}

function areEntryLinesBalanced(lines: EntryLine[]): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    const amount = parseAmount(line.amount);
    if (!Number.isSafeInteger(amount) || amount < 0) return false;
    if (line.side === "debit") debitTotal += amount;
    else creditTotal += amount;
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      return false;
    }
  }
  return debitTotal > 0 && debitTotal === creditTotal;
}

function addYearsToIsoDate(value: string, years: number): string | null {
  const date = parseIsoLocalDate(value);
  if (date == null) return null;
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  const day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
  return [
    String(year).padStart(4, "0"),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
