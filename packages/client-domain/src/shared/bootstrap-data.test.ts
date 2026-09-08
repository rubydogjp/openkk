import { describe, expect, it } from "vitest";

import { buildBootstrapFiscalPeriods } from "./bootstrap-data.js";
import { createFixedClock, type OpenkkConfig } from "./openkk-config.js";

describe("buildBootstrapFiscalPeriods", () => {
  it("uses canonical master ids in opening journals", () => {
    const [period] = buildBootstrapFiscalPeriods(config());
    const lines = period!.opening!.openingJournals!.flatMap(
      (journal) => journal.lines,
    );

    expect(
      lines.every((line) => line.taxCategoryId === "tax_out_of_scope"),
    ).toBe(true);
    expect(
      lines.every((line) => line.businessCategoryId.startsWith("biz_")),
    ).toBe(true);
  });
});

function config(): OpenkkConfig {
  return {
    clock: createFixedClock(new Date("2026-06-01T00:00:00Z")),
    env: "dev",
    bundleLabel: "test",
    isMockMode: true,
    authMode: "embedded",
    embeddedUser: { kind: "embedded", id: "user-1", displayName: "Test" },
    mockUserId: "user-1",
    initialMockUserId: "user-1",
    initialMockFiscalPeriodId: "fp-2026",
    sessionStorageKey: "session",
    fiscalPeriodStorageKey: "period",
    fiscalPeriodPolicy: null,
    editingPolicy: null,
    debugRoutesEnabled: false,
  };
}
