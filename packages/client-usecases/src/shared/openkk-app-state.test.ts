import { describe, expect, it } from "vitest";

import {
  applyFiscalPeriodUpdate,
  resolveFiscalPeriodPatchStage,
} from "./openkk-app-state";
import type {
  FiscalPeriod,
  FiscalPeriodStage,
} from "@rubydogjp/openkk-client-domain";
import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-client-ports";

describe("resolveFiscalPeriodPatchStage", () => {
  it("does not turn provisional closing into final closing", () => {
    expect(
      resolveFiscalPeriodPatchStage({ provisionalClosingCompleted: true }),
    ).toBeUndefined();
  });

  it("moves back to journalizing when provisional closing is cancelled", () => {
    expect(
      resolveFiscalPeriodPatchStage({ provisionalClosingCompleted: false }),
    ).toBe("journalizing");
  });

  it("keeps explicit stage changes", () => {
    expect(
      resolveFiscalPeriodPatchStage({
        stage: "post_closing",
        provisionalClosingCompleted: true,
      }),
    ).toBe("post_closing");
  });
});

describe("applyFiscalPeriodUpdate", () => {
  it("updates only the patched fiscal period", () => {
    const current = [
      period({ id: "fp-1", name: "before" }),
      period({ id: "fp-2", name: "other" }),
    ];

    const next = applyFiscalPeriodUpdate(
      current,
      "fp-1",
      remotePeriod({ id: "fp-1", name: "after" }),
    );

    expect(next.map((item) => item.name)).toEqual(["after", "other"]);
    expect(next[1]).toBe(current[1]);
  });

  it("keeps provisional closing state for non-final local patches", () => {
    const [next] = applyFiscalPeriodUpdate(
      [period({ id: "fp-1", provisionalClosingCompleted: false })],
      "fp-1",
      remotePeriod({ id: "fp-1", stage: "journalizing" }),
      true,
    );

    expect(next?.stage).toBe("journalizing");
    expect(next?.provisionalClosingCompleted).toBe(true);
  });
});

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "journalizing",
    provisionalClosingCompleted: false,
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    openingDebitTotal: 0,
    openingCreditTotal: 0,
    ...overrides,
  };
}

function remotePeriod(
  overrides: Partial<FiscalPeriodApiRecord> & { stage?: FiscalPeriodStage } = {},
): FiscalPeriodApiRecord {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "journalizing",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: null,
    ...overrides,
  };
}
