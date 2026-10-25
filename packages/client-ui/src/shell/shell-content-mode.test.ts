import { describe, expect, it } from "vitest";

import type { FiscalPeriod } from "@rubydogjp/openkk-client-domain";
import {
  ARCHIVED_FISCAL_PERIOD_PATH,
  FISCAL_PERIOD_CREATE_PATH,
  FISCAL_PERIOD_PICKER_PATH,
  NEXT_FISCAL_PERIOD_STEP_PATH,
  resolveShellContentMode,
  shouldRedirectArchivedFiscalPeriod,
  shouldRedirectMissingFiscalPeriod,
} from "./shell-content-mode.js";

const archivedPeriod = period({
  archiveStatus: "archived",
  archivedAt: "2027-03-01T00:00:00.000Z",
});

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
        currentFiscalPeriod: archivedPeriod,
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

  it("routes archived fiscal periods to the archived screen", () => {
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: archivedPeriod,
      }),
    ).toBe("archived");
  });
});

describe("next fiscal period step of an archived period", () => {
  it("stays open until the archived data is purged", () => {
    const purgedPeriod = period({
      archiveStatus: "purged",
      archivedAt: "2027-03-01T00:00:00.000Z",
    });

    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: NEXT_FISCAL_PERIOD_STEP_PATH,
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: archivedPeriod,
      }),
    ).toBe("normal");
    expect(
      shouldRedirectArchivedFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: NEXT_FISCAL_PERIOD_STEP_PATH,
        currentFiscalPeriod: archivedPeriod,
      }),
    ).toBe(false);
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: NEXT_FISCAL_PERIOD_STEP_PATH,
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: purgedPeriod,
      }),
    ).toBe("archived");
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

  it("redirects archived fiscal period routes to the archived fiscal period path", () => {
    expect(
      shouldRedirectArchivedFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: "/assist/fixed-assets",
        currentFiscalPeriod: archivedPeriod,
      }),
    ).toBe(true);
    expect(
      shouldRedirectArchivedFiscalPeriod({
        isReady: true,
        hasSession: true,
        pathname: ARCHIVED_FISCAL_PERIOD_PATH,
        currentFiscalPeriod: archivedPeriod,
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
    archivedAt: null,
    opening: {
      balanceLines: [],
      journals: [],
    },
    ...overrides,
  };
}
