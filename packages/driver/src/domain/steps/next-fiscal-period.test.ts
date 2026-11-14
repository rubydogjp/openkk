import { describe, expect, it } from "vitest";

import { entryRecord } from "../../../test-support/entry-record.js";
import {
  buildNextFiscalPeriodSuggestion,
  findCreatedNextFiscalPeriod,
  isOpeningCarryoverCandidate,
  isReadyForCarryover,
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

describe("findCreatedNextFiscalPeriod", () => {
  const year2026 = {
    id: "fp-2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    archiveStatus: "active" as const,
  };
  const year2027 = {
    id: "fp-2027",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    archiveStatus: "active" as const,
  };
  const year2028 = {
    id: "fp-2028",
    startDate: "2028-01-01",
    endDate: "2028-12-31",
    archiveStatus: "active" as const,
  };

  it("finds the period that already covers the suggested next dates", () => {
    expect(
      findCreatedNextFiscalPeriod(year2026, [year2028, year2026, year2027]),
    ).toBe(year2027);
  });

  it("finds a next period whose dates only partly match the suggestion", () => {
    const shortYear = {
      ...year2027,
      startDate: "2027-04-01",
      endDate: "2028-03-31",
    };

    expect(findCreatedNextFiscalPeriod(year2026, [year2026, shortYear])).toBe(
      shortYear,
    );
  });

  it("finds nothing when no later period exists or the earliest one leaves the next dates free", () => {
    const earlier = {
      ...year2027,
      id: "fp-2025",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    };

    expect(
      findCreatedNextFiscalPeriod(year2026, [year2026, earlier]),
    ).toBeNull();
    expect(
      findCreatedNextFiscalPeriod(year2026, [year2026, year2028]),
    ).toBeNull();
  });

  it("does not count a period whose data was deleted", () => {
    const purged = { ...year2027, archiveStatus: "purged" as const };

    expect(
      findCreatedNextFiscalPeriod(year2026, [year2026, purged]),
    ).toBeNull();
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

describe("isReadyForCarryover", () => {
  it("accepts only a closed period whose documents were received", () => {
    expect(
      isReadyForCarryover({
        phase: "post_closing",
        documentsReceivedCompleted: true,
      }),
    ).toBe(true);
    expect(
      isReadyForCarryover({
        phase: "post_closing",
        documentsReceivedCompleted: false,
      }),
    ).toBe(false);
    expect(
      isReadyForCarryover({
        phase: "journalizing",
        documentsReceivedCompleted: true,
      }),
    ).toBe(false);
  });
});
