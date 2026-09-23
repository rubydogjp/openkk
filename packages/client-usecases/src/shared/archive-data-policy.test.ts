import { describe, expect, it } from "vitest";

import { isSelectedFiscalPeriodDataPurged } from "./archive-data-policy.js";

describe("isSelectedFiscalPeriodDataPurged", () => {
  it("detects only the selected purged period", () => {
    const periods = [
      { id: "active", archiveStatus: "active" as const },
      { id: "archived", archiveStatus: "archived" as const },
      { id: "purged", archiveStatus: "purged" as const },
    ];

    expect(isSelectedFiscalPeriodDataPurged(periods, "purged")).toBe(true);
    expect(isSelectedFiscalPeriodDataPurged(periods, "archived")).toBe(false);
    expect(isSelectedFiscalPeriodDataPurged(periods, "active")).toBe(false);
    expect(isSelectedFiscalPeriodDataPurged(periods, null)).toBe(false);
  });
});
