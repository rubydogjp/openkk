import type { FiscalPeriodArchiveStatus } from "../shared/models.js";
import { parseIsoLocalDate } from "../shared/parse-utils.js";
import { compareYearMonth, parseYearMonth } from "./year-month.js";

export type FiscalPeriodDateValidationResult =
  { ok: true } | { ok: false; message: string };

export function isCurrentMonthWithinFiscalPeriod(
  startDate: string,
  endDate: string,
  today: Date,
): boolean {
  const now = { year: today.getFullYear(), month: today.getMonth() + 1 };
  return (
    compareYearMonth(parseYearMonth(startDate), now) <= 0 &&
    compareYearMonth(now, parseYearMonth(endDate)) <= 0
  );
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

export function hasActiveFiscalPeriodOverlap(
  input: { startDate: string; endDate: string },
  periods: ReadonlyArray<{
    id: string;
    startDate: string;
    endDate: string;
    archiveStatus: FiscalPeriodArchiveStatus;
  }>,
  excludedPeriodId: string | null,
): boolean {
  return periods.some(
    (period) =>
      period.id !== excludedPeriodId &&
      period.archiveStatus === "active" &&
      input.startDate <= period.endDate &&
      input.endDate >= period.startDate,
  );
}
