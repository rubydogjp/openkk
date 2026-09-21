import { describe, expect, it } from "vitest";

import { entryRecord } from "../../test-support/entry-record.js";
import {
  buildNextFiscalPeriodSuggestion,
  isOpeningCarryoverCandidate,
} from "./next-fiscal-period.js";

describe("buildNextFiscalPeriodSuggestion", () => {
  it("suggests the next calendar year for a calendar-year period", () => {
    expect(buildNextFiscalPeriodSuggestion("2026-12-31")).toEqual({
      name: "2027年分",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
  });

  it("preserves non-calendar fiscal period month and day boundaries", () => {
    expect(buildNextFiscalPeriodSuggestion("2026-03-31")).toEqual({
      name: "2027年分",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
  });

  it("starts on the day after a leap-spanning period ends", () => {
    expect(buildNextFiscalPeriodSuggestion("2025-02-28")).toEqual({
      name: "2026年分",
      startDate: "2025-03-01",
      endDate: "2026-02-28",
    });
  });
});

describe("isOpeningCarryoverCandidate", () => {
  it("offers balanced accruals and excludes settlements and trade receivables", () => {
    const base = {
      debit: "消耗品費",
      debitType: "expense" as const,
      debitAmount: "1,000",
      creditAmount: "1,000",
    };
    expect(
      isOpeningCarryoverCandidate(
        entryRecord({ credit: "未払金", creditType: "liability" }, base),
      ),
    ).toBe(true);
    expect(
      isOpeningCarryoverCandidate(
        entryRecord({ credit: "普通預金", creditType: "asset" }, base),
      ),
    ).toBe(false);
    expect(
      isOpeningCarryoverCandidate(
        entryRecord({ credit: "買掛金", creditType: "liability" }, base),
      ),
    ).toBe(false);
    expect(
      isOpeningCarryoverCandidate(
        entryRecord(
          { credit: "未払金", creditType: "liability", creditAmount: "999" },
          base,
        ),
      ),
    ).toBe(false);
  });
});
