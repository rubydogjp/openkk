export function isCurrentMonthWithinFiscalPeriod(
  startDate: string,
  endDate: string,
  today: Date,
): boolean {
  const start = { year: Number(startDate.slice(0, 4)), month: Number(startDate.slice(5, 7)) };
  const end = { year: Number(endDate.slice(0, 4)), month: Number(endDate.slice(5, 7)) };
  const now = { year: today.getFullYear(), month: today.getMonth() + 1 };
  const cmp = (a: { year: number; month: number }, b: { year: number; month: number }) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month;
  return cmp(start, now) <= 0 && cmp(now, end) <= 0;
}
