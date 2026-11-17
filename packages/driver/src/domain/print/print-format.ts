import { formatAmount } from "../shared/parse-utils.js";

export function formatAmountOrBlank(amount: number): string {
  return amount === 0 ? "" : formatAmount(amount);
}

export function formatPrintDate(isoDate: string): string {
  return isoDate.replace(/-/g, "/");
}

export function formatMonthLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return Number.isInteger(year) &&
    year > 0 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
    ? `${year}年${month}月分`
    : "日付未設定";
}
