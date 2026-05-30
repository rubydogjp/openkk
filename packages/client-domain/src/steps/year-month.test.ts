import { describe, expect, it } from "vitest";

import { buildYearMonthRange, compareYearMonth, parseYearMonth } from "./year-month";

describe("parseYearMonth", () => {
  it("parses YYYY-MM string", () => {
    expect(parseYearMonth("2026-01")).toEqual({ year: 2026, month: 1 });
    expect(parseYearMonth("2026-12")).toEqual({ year: 2026, month: 12 });
  });

  it("parses YYYY-MM-DD string (ignores day)", () => {
    expect(parseYearMonth("2026-03-15")).toEqual({ year: 2026, month: 3 });
  });
});

describe("compareYearMonth", () => {
  it("returns 0 for same year-month", () => {
    expect(compareYearMonth({ year: 2026, month: 6 }, { year: 2026, month: 6 })).toBe(0);
  });

  it("returns negative when left is earlier in the same year", () => {
    expect(compareYearMonth({ year: 2026, month: 3 }, { year: 2026, month: 9 })).toBeLessThan(0);
  });

  it("returns positive when left is later in the same year", () => {
    expect(compareYearMonth({ year: 2026, month: 9 }, { year: 2026, month: 3 })).toBeGreaterThan(0);
  });

  it("compares across years correctly", () => {
    expect(compareYearMonth({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
    expect(compareYearMonth({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBeGreaterThan(0);
  });
});

describe("buildYearMonthRange", () => {
  it("returns a single month when start equals end", () => {
    const range = buildYearMonthRange({ year: 2026, month: 6 }, { year: 2026, month: 6 });
    expect(range).toHaveLength(1);
    expect(range[0]).toEqual({ year: 2026, month: 6, key: "2026-06" });
  });

  it("returns months within the same year", () => {
    const range = buildYearMonthRange({ year: 2026, month: 1 }, { year: 2026, month: 3 });
    expect(range).toHaveLength(3);
    expect(range.map((m) => m.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("crosses a year boundary correctly", () => {
    const range = buildYearMonthRange({ year: 2025, month: 11 }, { year: 2026, month: 2 });
    expect(range.map((m) => m.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("produces a 12-month range for a full year", () => {
    const range = buildYearMonthRange({ year: 2026, month: 1 }, { year: 2026, month: 12 });
    expect(range).toHaveLength(12);
    expect(range[0]?.key).toBe("2026-01");
    expect(range[11]?.key).toBe("2026-12");
  });

  it("returns empty array when end is before start", () => {
    const range = buildYearMonthRange({ year: 2026, month: 6 }, { year: 2026, month: 3 });
    expect(range).toHaveLength(0);
  });

  it("zero-pads single-digit months in the key", () => {
    const range = buildYearMonthRange({ year: 2026, month: 9 }, { year: 2026, month: 9 });
    expect(range[0]?.key).toBe("2026-09");
  });
});
