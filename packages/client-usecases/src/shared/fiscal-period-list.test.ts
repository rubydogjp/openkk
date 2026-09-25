import { describe, expect, it } from "vitest";

import { applyFiscalPeriodUpdate } from "./fiscal-period-list.js";
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

  it("upserts a missing period and removes stale duplicates", () => {
    const patched = remotePeriod({ id: "fp-new", name: "server" });

    expect(applyFiscalPeriodUpdate([], patched).map((item) => item.id)).toEqual([
      "fp-new",
    ]);
    expect(
      applyFiscalPeriodUpdate(
        [
          period({ id: "fp-new", name: "old-1" }),
          period({ id: "fp-new", name: "old-2" }),
        ],
        patched,
      ).map((item) => item.name),
    ).toEqual(["server"]);
  });
});

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  const base: FiscalPeriod = {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    archivedAt: null,
    opening: {
      balanceLines: [],
      journals: [],
    },
  };
  return Object.assign(base, overrides);
}

function remotePeriod(
  overrides: Partial<FiscalPeriodApiRecord> = {},
): FiscalPeriodApiRecord {
  const base: FiscalPeriodApiRecord = {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: {
      balanceLines: [],
      journals: [],
    },
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    archivedAt: null,
  };
  return Object.assign(base, overrides);
}
