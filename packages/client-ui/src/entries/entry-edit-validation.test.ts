import { describe, expect, it } from "vitest";

import {
  validateBusinessRate,
  validateEntryAmounts,
  validateEntryDate,
  validateEntryLineCount,
} from "./entry-edit-validation.js";

describe("validateBusinessRate", () => {
  it("accepts the default blank value, boundaries, and decimals", () => {
    expect(validateBusinessRate("")).toBeNull();
    expect(validateBusinessRate("0")).toBeNull();
    expect(validateBusinessRate("33.5")).toBeNull();
    expect(validateBusinessRate("100")).toBeNull();
  });

  it("rejects non-decimal and out-of-range values", () => {
    expect(validateBusinessRate("abc")).toMatch(/0から100/);
    expect(validateBusinessRate("1e2")).toMatch(/0から100/);
    expect(validateBusinessRate("-1")).toMatch(/0から100/);
    expect(validateBusinessRate("100.1")).toMatch(/0から100/);
  });
});

describe("validateEntryDate", () => {
  it("accepts both inclusive fiscal-period boundaries", () => {
    expect(validateEntryDate("2026-01-01", "2026-01-01", "2026-12-31")).toBeNull();
    expect(validateEntryDate("2026-12-31", "2026-01-01", "2026-12-31")).toBeNull();
  });

  it("rejects invalid calendar dates", () => {
    expect(validateEntryDate("2026-02-29", "2026-01-01", "2026-12-31")).toBe(
      "正しい日付を選択してください。",
    );
  });

  it("rejects dates before and after the fiscal period", () => {
    const expected =
      "日付は会計期間（2026/01/01〜2026/12/31）の範囲内で選択してください。";

    expect(validateEntryDate("2025-12-31", "2026-01-01", "2026-12-31")).toBe(
      expected,
    );
    expect(validateEntryDate("2027-01-01", "2026-01-01", "2026-12-31")).toBe(
      expected,
    );
  });
});

describe("validateEntryAmounts", () => {
  it("accepts safe line amounts and totals", () => {
    expect(validateEntryAmounts(["500", "500"], ["1,000"])).toBeNull();
  });

  it("rejects an unsafe line amount", () => {
    expect(validateEntryAmounts(["9007199254740993"], ["1"])).toMatch(
      /大きすぎる/,
    );
  });

  it("rejects an unsafe total even when each line is safe", () => {
    const half = "4503599627370496";

    expect(validateEntryAmounts([half, half], [half, half])).toMatch(
      /大きすぎる/,
    );
  });
});

describe("validateEntryLineCount", () => {
  it("accepts the limit and rejects additional compound lines", () => {
    expect(validateEntryLineCount(1_000)).toBeNull();
    expect(validateEntryLineCount(1_001)).toMatch(/1,000件まで/);
  });
});
