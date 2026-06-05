import { parseIsoLocalDate } from "../shared/parse-utils";

export type FiscalPeriodDateValidationResult =
  | { ok: true }
  | { ok: false; message: string };

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

export function validateFiscalPeriodDates(
  startDate: string,
  endDate: string,
): FiscalPeriodDateValidationResult {
  const start = parseIsoLocalDate(startDate);
  const end = parseIsoLocalDate(endDate);
  if (start == null || end == null) {
    return { ok: false, message: "期間の日付を正しく入力してください。" };
  }
  if (start.getTime() > end.getTime()) {
    return {
      ok: false,
      message: "期間の開始日は終了日以前にしてください。",
    };
  }
  return { ok: true };
}
