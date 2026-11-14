import { describe, expect, it } from "vitest";

import { applyFiscalPeriodUpdate } from "./fiscal-period-list.js";
import type { FiscalPeriod } from "../../domain/index.js";
import type { FiscalPeriodApiRecord } from "../../ports/index.js";

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

  it("uses the backend's phase without a local overlay", () => {
    const [next] = applyFiscalPeriodUpdate(
      [period({ id: "fp-1" })],
      remotePeriod({ id: "fp-1", phase: "pre_closing" }),
    );

    expect(next?.phase).toBe("pre_closing");
  });

  it("reads a period archived by an earlier version as an ordinary period and keeps a purged one apart", () => {
    const [archived] = applyFiscalPeriodUpdate(
      [],
      remotePeriod({
        id: "fp-1",
        archiveStatus: "archived",
        archivedAt: "2027-03-01T00:00:00.000Z",
      }),
    );
    const [purged] = applyFiscalPeriodUpdate(
      [],
      remotePeriod({
        id: "fp-2",
        archiveStatus: "purged",
        archivedAt: "2027-03-01T00:00:00.000Z",
      }),
    );

    expect(archived?.archiveStatus).toBe("active");
    expect(purged?.archiveStatus).toBe("purged");
  });

  it("upserts a missing period and removes stale duplicates", () => {
    const patched = remotePeriod({ id: "fp-new", name: "backend" });

    expect(applyFiscalPeriodUpdate([], patched).map((item) => item.id)).toEqual(
      ["fp-new"],
    );
    expect(
      applyFiscalPeriodUpdate(
        [
          period({ id: "fp-new", name: "old-1" }),
          period({ id: "fp-new", name: "old-2" }),
        ],
        patched,
      ).map((item) => item.name),
    ).toEqual(["backend"]);
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
