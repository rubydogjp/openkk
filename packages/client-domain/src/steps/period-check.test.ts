import { describe, expect, it } from "vitest";

import {
  isCurrentMonthWithinFiscalPeriod,
  validateFiscalPeriodDates,
} from "./period-check";

describe("isCurrentMonthWithinFiscalPeriod", () => {
  it("returns true when today is the first month of the period", () => {
    expect(isCurrentMonthWithinFiscalPeriod("2026-01-01", "2026-12-31", new Date(2026, 0, 1))).toBe(true);
  });

  it("returns true when today is the last month of the period", () => {
    expect(isCurrentMonthWithinFiscalPeriod("2026-01-01", "2026-12-31", new Date(2026, 11, 31))).toBe(true);
  });

  it("returns true when today is mid-period", () => {
    expect(isCurrentMonthWithinFiscalPeriod("2026-01-01", "2026-12-31", new Date(2026, 5, 15))).toBe(true);
  });

  it("returns false when today is before the period starts", () => {
    expect(isCurrentMonthWithinFiscalPeriod("2026-04-01", "2027-03-31", new Date(2026, 2, 31))).toBe(false);
  });

  it("returns false when today is after the period ends", () => {
    expect(isCurrentMonthWithinFiscalPeriod("2026-01-01", "2026-12-31", new Date(2027, 0, 1))).toBe(false);
  });

  it("handles fiscal years that span a calendar year boundary", () => {
    expect(isCurrentMonthWithinFiscalPeriod("2025-10-01", "2026-09-30", new Date(2026, 0, 15))).toBe(true);
    expect(isCurrentMonthWithinFiscalPeriod("2025-10-01", "2026-09-30", new Date(2026, 9, 1))).toBe(false);
  });

  it("is inclusive on both boundary months", () => {
    // start month boundary
    expect(isCurrentMonthWithinFiscalPeriod("2026-03-01", "2026-09-30", new Date(2026, 2, 1))).toBe(true);
    // end month boundary
    expect(isCurrentMonthWithinFiscalPeriod("2026-03-01", "2026-09-30", new Date(2026, 8, 30))).toBe(true);
    // one month before start
    expect(isCurrentMonthWithinFiscalPeriod("2026-03-01", "2026-09-30", new Date(2026, 1, 28))).toBe(false);
    // one month after end
    expect(isCurrentMonthWithinFiscalPeriod("2026-03-01", "2026-09-30", new Date(2026, 9, 1))).toBe(false);
  });
});

describe("validateFiscalPeriodDates", () => {
  it("accepts a valid inclusive date range", () => {
    expect(validateFiscalPeriodDates("2026-01-01", "2026-12-31")).toEqual({
      ok: true,
    });
    expect(validateFiscalPeriodDates("2026-01-01", "2026-01-01")).toEqual({
      ok: true,
    });
  });

  it("rejects invalid calendar dates", () => {
    expect(validateFiscalPeriodDates("2026-02-29", "2026-12-31")).toEqual({
      ok: false,
      message: "期間の日付を正しく入力してください。",
    });
    expect(validateFiscalPeriodDates("2026-01-01", "2026-13-31")).toEqual({
      ok: false,
      message: "期間の日付を正しく入力してください。",
    });
  });

  it("rejects a range whose start date is after its end date", () => {
    expect(validateFiscalPeriodDates("2026-12-31", "2026-01-01")).toEqual({
      ok: false,
      message: "期間の開始日は終了日以前にしてください。",
    });
  });
});
