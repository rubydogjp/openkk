export type YearMonth = { year: number; month: number };

export function parseYearMonth(value: string): YearMonth {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
  };
}

export function compareYearMonth(left: YearMonth, right: YearMonth): number {
  if (left.year !== right.year) return left.year - right.year;
  return left.month - right.month;
}

export function formatYearMonthKey(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

export function buildYearMonthRange(
  start: YearMonth,
  end: YearMonth,
): YearMonth[] {
  const months: YearMonth[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
