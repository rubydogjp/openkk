import { describe, expect, it } from "vitest";

import { isSelectedFiscalPeriodDataPurged } from "./archive-data-policy.js";

describe("isSelectedFiscalPeriodDataPurged", () => {
  it("detects only the selected archived stub", () => {
    const periods = [
      {
        id: "active",
        archiveStatus: "active" as const,
        archiveDataAvailable: false,
      },
      {
        id: "archive-with-data",
        archiveStatus: "archived" as const,
        archiveDataAvailable: true,
      },
      {
        id: "purged",
        archiveStatus: "archived" as const,
        archiveDataAvailable: false,
      },
    ];

    expect(isSelectedFiscalPeriodDataPurged(periods, "purged")).toBe(true);
    expect(
      isSelectedFiscalPeriodDataPurged(periods, "archive-with-data"),
    ).toBe(false);
    expect(isSelectedFiscalPeriodDataPurged(periods, "active")).toBe(false);
    expect(isSelectedFiscalPeriodDataPurged(periods, null)).toBe(false);
  });
});
