import { describe, expect, it } from "vitest";

import { applyFiscalPeriodUpdate } from "./openkk-app-state";
import type { FiscalPeriod } from "@rubydogjp/openkk-client-domain";
import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-client-ports";

describe("applyFiscalPeriodUpdate", () => {
  it("updates only the patched fiscal period", () => {
    const current = [
      period({ id: "fp-1", name: "before" }),
      period({ id: "fp-2", name: "other" }),
    ];

    const next = applyFiscalPeriodUpdate(
      current,
      remotePeriod({ id: "fp-1", name: "after" }),
    );

    expect(next.map((item) => item.name)).toEqual(["after", "other"]);
    expect(next[1]).toBe(current[1]);
  });

  it("uses the server phase and archive status without a local overlay", () => {
    const [next] = applyFiscalPeriodUpdate(
      [period({ id: "fp-1" })],
      remotePeriod({
        id: "fp-1",
        phase: "pre_closing",
        archiveStatus: "archived",
      }),
    );

    expect(next?.phase).toBe("pre_closing");
    expect(next?.archiveStatus).toBe("archived");
  });
});

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    openingDebitTotal: 0,
    openingCreditTotal: 0,
    ...overrides,
  };
}

function remotePeriod(
  overrides: Partial<FiscalPeriodApiRecord> = {},
): FiscalPeriodApiRecord {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: null,
    ...overrides,
  };
}
