import { describe, expect, it } from "vitest";

import { buildPeriodLockMessage, isJournalizingActive } from "./period-lock";
import type { FiscalPeriod } from "./models";

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: "fp-1",
    userId: "user-1",
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
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isJournalizingActive", () => {
  it("returns false for null/undefined", () => {
    expect(isJournalizingActive(null)).toBe(false);
    expect(isJournalizingActive(undefined)).toBe(false);
  });

  it("returns false when stage is pre_opening", () => {
    expect(isJournalizingActive(period({ phase: "pre_opening" }))).toBe(false);
  });

  it("returns false when stage is post_closing", () => {
    expect(isJournalizingActive(period({ phase: "post_closing" }))).toBe(false);
  });

  it("returns false when pre-closing", () => {
    expect(isJournalizingActive(period({ phase: "pre_closing" }))).toBe(false);
  });

  it("returns false when archived", () => {
    expect(isJournalizingActive(period({ archiveStatus: "archived" }))).toBe(false);
  });

  it("returns true when journalizing", () => {
    expect(isJournalizingActive(period({ phase: "journalizing" }))).toBe(true);
  });
});

describe("buildPeriodLockMessage", () => {
  it("returns locked message when period is null", () => {
    const msg = buildPeriodLockMessage(null);
    expect(msg).not.toBeNull();
    expect(msg?.title).toBeTruthy();
  });

  it("returns locked message when period is undefined", () => {
    expect(buildPeriodLockMessage(undefined)).not.toBeNull();
  });

  it("returns locked message when stage is pre_opening", () => {
    const msg = buildPeriodLockMessage(period({ phase: "pre_opening" }));
    expect(msg).not.toBeNull();
  });

  it("returns locked message when stage is post_closing", () => {
    const msg = buildPeriodLockMessage(period({ phase: "post_closing" }));
    expect(msg).not.toBeNull();
  });

  it("returns locked message when pre-closing", () => {
    const msg = buildPeriodLockMessage(period({ phase: "pre_closing" }));
    expect(msg).not.toBeNull();
  });

  it("returns locked message when archived", () => {
    const msg = buildPeriodLockMessage(period({ archiveStatus: "archived" }));
    expect(msg?.description).toContain("圧縮保存済み");
  });

  it("returns null (unlocked) when journalizing and not closed", () => {
    const msg = buildPeriodLockMessage(period({ phase: "journalizing" }));
    expect(msg).toBeNull();
  });

  it("incorporates custom subjectVerb in the description", () => {
    const msg = buildPeriodLockMessage(period({ phase: "pre_opening" }), "入力できます");
    expect(msg?.description).toContain("入力できます");
  });
});
