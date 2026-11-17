import { describe, expect, it } from "vitest";

import { assertFiscalPeriodCanCarryOver } from "./fiscal-period-carryover.js";

const CLOSED_2025 = {
  endDate: "2025-12-31",
  phase: "post_closing" as const,
  documentsReceivedCompleted: true,
  archiveStatus: "active" as const,
};

describe("assertFiscalPeriodCanCarryOver", () => {
  it("carries over into the period that starts the day after the source ends", () => {
    expect(() =>
      assertFiscalPeriodCanCarryOver(CLOSED_2025, "2026-01-01"),
    ).not.toThrow();
    expect(() =>
      assertFiscalPeriodCanCarryOver(
        { ...CLOSED_2025, endDate: "2024-02-29" },
        "2024-03-01",
      ),
    ).not.toThrow();
  });

  it.each(["2027-01-01", "2026-01-02", "2025-12-31"])(
    "refuses a target starting %s, which does not follow the source directly",
    (startDate) => {
      expect(() =>
        assertFiscalPeriodCanCarryOver(CLOSED_2025, startDate),
      ).toThrow(
        "Carryover target must start the day after the source period ends",
      );
    },
  );
});
