import { describe, expect, it } from "vitest";

import type { FiscalPeriod } from "@rubydogjp/openkk-driver";
import {
  FISCAL_PERIOD_CREATE_PATH,
  FISCAL_PERIOD_PICKER_PATH,
  LEGACY_PURGED_FISCAL_PERIOD_PATH,
  resolveShellContentMode,
  shouldRedirectLegacyPurgedFiscalPeriod,
  shouldRedirectMissingFiscalPeriod,
} from "./shell-content-mode.js";

const closedPeriod = period({ phase: "post_closing" });
const purgedPeriod = period({ archiveStatus: "purged" });

describe("resolveShellContentMode", () => {
  it("shows loading until app state is ready", () => {
    expect(
      resolveShellContentMode({
        isReady: false,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: period({}),
      }),
    ).toBe("loading");
  });

  it("shows sign-in before session exists", () => {
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: false,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: period({}),
      }),
    ).toBe("sign-in");
  });

  it("keeps the fiscal period picker and create pages available", () => {
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: FISCAL_PERIOD_PICKER_PATH,
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: closedPeriod,
      }),
    ).toBe("fiscal-periods");
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: FISCAL_PERIOD_CREATE_PATH,
        currentFiscalPeriodId: null,
        currentFiscalPeriod: null,
      }),
    ).toBe("normal");
  });

  it("shows a closed period that holds its data", () => {
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: closedPeriod,
      }),
    ).toBe("normal");
  });

  it("routes a period whose data was purged to the notice screen", () => {
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: purgedPeriod,
      }),
    ).toBe("legacy-purged");
  });
});

describe("shell redirects", () => {
  it("redirects missing periods except picker and create pages", () => {
    expect(
      shouldRedirectMissingFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: null,
      }),
    ).toBe(true);
    expect(
      shouldRedirectMissingFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: FISCAL_PERIOD_CREATE_PATH,
        currentFiscalPeriodId: null,
      }),
    ).toBe(false);
  });

  it("redirects the routes of a purged period to the notice screen", () => {
    expect(
      shouldRedirectLegacyPurgedFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: "/assist/fixed-assets",
        currentFiscalPeriod: purgedPeriod,
      }),
    ).toBe(true);
    expect(
      shouldRedirectLegacyPurgedFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: LEGACY_PURGED_FISCAL_PERIOD_PATH,
        currentFiscalPeriod: purgedPeriod,
      }),
    ).toBe(false);
    expect(
      shouldRedirectLegacyPurgedFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: "/assist/fixed-assets",
        currentFiscalPeriod: closedPeriod,
      }),
    ).toBe(false);
  });
});

function period(overrides: Partial<FiscalPeriod>): FiscalPeriod {
  return {
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
    ...overrides,
  };
}
