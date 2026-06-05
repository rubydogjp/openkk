import { describe, expect, it } from "vitest";

import { buildPeriodLockMessage, isJournalingActive } from "./period-lock";
import type { FiscalPeriod } from "./models";

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "journalizing",
    archived: false,
    provisionalClosingCompleted: false,
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    openingDebitTotal: 0,
    openingCreditTotal: 0,
    ...overrides,
  };
}

describe("isJournalingActive", () => {
  it("returns false for null/undefined", () => {
    expect(isJournalingActive(null)).toBe(false);
    expect(isJournalingActive(undefined)).toBe(false);
  });

  it("returns false when stage is pre_opening", () => {
    expect(isJournalingActive(period({ stage: "pre_opening" }))).toBe(false);
  });

  it("returns false when stage is post_closing", () => {
    expect(isJournalingActive(period({ stage: "post_closing" }))).toBe(false);
  });

  it("returns false when provisionally closed", () => {
    expect(isJournalingActive(period({ stage: "journalizing", provisionalClosingCompleted: true }))).toBe(false);
  });

  it("returns false when archived", () => {
    expect(isJournalingActive(period({ archived: true }))).toBe(false);
  });

  it("returns true when journalizing and not provisionally closed", () => {
    expect(isJournalingActive(period({ stage: "journalizing", provisionalClosingCompleted: false }))).toBe(true);
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
    const msg = buildPeriodLockMessage(period({ stage: "pre_opening" }));
    expect(msg).not.toBeNull();
  });

  it("returns locked message when stage is post_closing", () => {
    const msg = buildPeriodLockMessage(period({ stage: "post_closing" }));
    expect(msg).not.toBeNull();
  });

  it("returns locked message when provisionally closed", () => {
    const msg = buildPeriodLockMessage(period({ stage: "journalizing", provisionalClosingCompleted: true }));
    expect(msg).not.toBeNull();
  });

  it("returns locked message when archived", () => {
    const msg = buildPeriodLockMessage(period({ archived: true }));
    expect(msg?.description).toContain("圧縮保存済み");
  });

  it("returns null (unlocked) when journalizing and not closed", () => {
    const msg = buildPeriodLockMessage(period({ stage: "journalizing", provisionalClosingCompleted: false }));
    expect(msg).toBeNull();
  });

  it("incorporates custom subjectVerb in the description", () => {
    const msg = buildPeriodLockMessage(period({ stage: "pre_opening" }), "入力できます");
    expect(msg?.description).toContain("入力できます");
  });
});
