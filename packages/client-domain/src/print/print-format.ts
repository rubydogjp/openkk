export function formatAmountOrBlank(amount: number): string {
  return amount === 0 ? "" : new Intl.NumberFormat("ja-JP").format(amount);
}

export function formatPrintDate(isoDate: string): string {
  return isoDate.replace(/-/g, "/");
}

export function formatMonthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? `${month}月分`
    : "日付未設定";
}
