import { describe, expect, it } from "vitest";
import {
  buildFiscalPeriodArchivePayload,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";

import {
  carryoverFromArchive,
  isOpeningCarryoverSourceFor,
} from "./opening-carryover.js";

describe("isOpeningCarryoverSourceFor", () => {
  const target = period({
    id: "fp-2027",
    name: "2027年分",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
  });

  it("takes a fully closed period that ends before the target starts", () => {
    expect(isOpeningCarryoverSourceFor(target, closed())).toBe(true);
  });

  it("skips the target itself, open or unfinished periods, purged data, and later periods", () => {
    for (const candidate of [
      closed({ id: "fp-2027" }),
      closed({ phase: "journalizing" }),
      closed({ documentsReceivedCompleted: false }),
      closed({ archiveStatus: "purged" }),
      closed({ startDate: "2027-01-01", endDate: "2027-12-31" }),
    ]) {
      expect(isOpeningCarryoverSourceFor(target, candidate)).toBe(false);
    }
  });
});

describe("carryoverFromArchive", () => {
  const archive = buildFiscalPeriodArchivePayload({
    createdAt: "2027-01-05T00:00:00.000Z",
    fiscalPeriod: {
      id: "fp-2026",
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    },
    entries: [{ id: "e-1" }, { id: "e-2" }, { id: "e-3" }],
    fixedAssets: [],
    closings: [],
  });

  it("turns the chosen reversal entries into their places in the archive", () => {
    expect(
      carryoverFromArchive(archive, {
        carryBalances: true,
        reversalEntryIds: ["e-3", "e-1", "missing"],
        carryFixedAssets: false,
      }),
    ).toEqual({
      archive,
      carryBalances: true,
      reversalEntryIndexes: [0, 2],
      carryFixedAssets: false,
    });
  });

  it("keeps the reversals as they are when none are chosen to replace them", () => {
    expect(
      carryoverFromArchive(archive, {
        carryBalances: false,
        reversalEntryIds: null,
        carryFixedAssets: true,
      }).reversalEntryIndexes,
    ).toBeNull();
  });
});

function closed(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return period({
    id: "fp-2026",
    phase: "post_closing",
    documentsReceivedCompleted: true,
    archiveStatus: "archived",
    ...overrides,
  });
}

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
