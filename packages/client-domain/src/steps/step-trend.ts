import type { EntryRecord } from "../entries/entry-record.js";
import {
  computeExpenseContribution,
  computeRevenueContribution,
} from "./summary.js";
import {
  buildYearMonthRange,
  formatYearMonthKey,
  parseYearMonth,
} from "./year-month.js";

export type StepTrendPoint = {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;

  isCurrent: boolean;
};

export function buildStepTrendPoints(input: {
  entries: EntryRecord[];
  startDate: string;
  endDate: string;
  today: Date;
}): StepTrendPoint[] {
  const months = buildYearMonthRange(
    parseYearMonth(input.startDate),
    parseYearMonth(input.endDate),
  );
  const totals = new Map<string, { revenue: number; expenses: number }>();
  for (const month of months) {
    totals.set(formatYearMonthKey(month), { revenue: 0, expenses: 0 });
  }
  for (const entry of input.entries) {
    const key = entry.date.slice(0, 7);
    const bucket = totals.get(key);
    if (bucket == null) continue;
    const rate = entry.businessRate;
    bucket.revenue += computeRevenueContribution(entry, rate);
    bucket.expenses += computeExpenseContribution(entry, rate);
  }
  const todayKey = formatYearMonthKey({
    year: input.today.getFullYear(),
    month: input.today.getMonth() + 1,
  });
  return months.map((month) => {
    const key = formatYearMonthKey(month);
    const total = totals.get(key) ?? { revenue: 0, expenses: 0 };
    return {
      label: `${month.month}月`,
      revenue: total.revenue,
      expenses: total.expenses,
      profit: total.revenue - total.expenses,
      isCurrent: key === todayKey,
    };
  });
}
