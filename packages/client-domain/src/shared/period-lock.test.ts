import { describe, expect, it } from "vitest";

import { buildPeriodLockMessage } from "./period-lock.js";
import type { FiscalPeriod } from "./models.js";

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

describe("buildPeriodLockMessage", () => {
  it("returns locked message when period is null", () => {
    const msg = buildPeriodLockMessage(null, null);
    expect(msg).not.toBeNull();
    expect(msg?.title).toBeTruthy();
  });

  it("returns locked message when phase is pre_opening", () => {
    const msg = buildPeriodLockMessage(period({ phase: "pre_opening" }), null);
    expect(msg).not.toBeNull();
  });

  it("returns locked message when phase is post_closing", () => {
    const msg = buildPeriodLockMessage(period({ phase: "post_closing" }), null);
    expect(msg).not.toBeNull();
  });

  it("returns locked message when pre-closing", () => {
    const msg = buildPeriodLockMessage(period({ phase: "pre_closing" }), null);
    expect(msg).not.toBeNull();
  });

  it("returns locked message when archived", () => {
    const msg = buildPeriodLockMessage(period({ archiveStatus: "archived" }), null);
    expect(msg?.description).toContain("圧縮保存済み");
  });

  it("returns null (unlocked) when journalizing and not closed", () => {
    const msg = buildPeriodLockMessage(period({ phase: "journalizing" }), null);
    expect(msg).toBeNull();
  });

  it("incorporates custom subjectVerb in the description", () => {
    const msg = buildPeriodLockMessage(
      period({ phase: "pre_opening" }),
      "入力できます",
    );
    expect(msg?.description).toContain("入力できます");
  });
});
