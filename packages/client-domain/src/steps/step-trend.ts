import {
  computeExpenseContribution,
  computeRevenueContribution,
  parseBusinessRate,
  type EntrySummaryRow,
} from "./summary";
import { buildYearMonthRange, parseYearMonth } from "./year-month";

export type StepTrendPoint = {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;

  isCurrent: boolean;
};

export function buildStepTrendPoints(input: {
  // 複合仕訳(lines)も集計対象に含むよう、summary と同じ EntrySummaryRow を使う。
  entries: Array<EntrySummaryRow & { date: string }>;
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
    totals.set(month.key, { revenue: 0, expenses: 0 });
  }
  for (const entry of input.entries) {
    const key = entry.date.slice(0, 7);
    const bucket = totals.get(key);
    if (bucket == null) continue;
    const rate = parseBusinessRate(entry.businessRate);
    bucket.revenue += computeRevenueContribution(entry, rate);
    bucket.expenses += computeExpenseContribution(entry, rate);
  }
  const todayKey = `${input.today.getFullYear()}-${String(input.today.getMonth() + 1).padStart(2, "0")}`;
  return months.map((month) => {
    const total = totals.get(month.key) ?? { revenue: 0, expenses: 0 };
    return {
      label: `${month.month}月`,
      revenue: total.revenue,
      expenses: total.expenses,
      profit: total.revenue - total.expenses,
      isCurrent: month.key === todayKey,
    };
  });
}
