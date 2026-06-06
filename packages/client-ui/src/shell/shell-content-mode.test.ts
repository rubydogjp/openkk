import { describe, expect, it } from "vitest";

import type { FiscalPeriod } from "@rubydogjp/openkk-client-domain";
import {
  ARCHIVED_WORKSPACE_PATH,
  FISCAL_PERIOD_CREATE_PATH,
  FISCAL_PERIOD_PICKER_PATH,
  resolveShellContentMode,
  shouldRedirectArchivedWorkspace,
  shouldRedirectMissingFiscalPeriod,
} from "./shell-content-mode";

describe("resolveShellContentMode", () => {
  it("shows loading until app state is ready", () => {
    expect(
      resolveShellContentMode({
        isReady: false,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: period(),
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
        currentFiscalPeriod: period(),
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
        currentFiscalPeriod: period({ archiveStatus: "archived" }),
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

  it("routes archived workspaces to the archived screen", () => {
    expect(
      resolveShellContentMode({
        isReady: true,
        hasSession: true,
        pathname: "/entries",
        currentFiscalPeriodId: "fp-1",
        currentFiscalPeriod: period({ archiveStatus: "archived" }),
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

  it("normalizes archived workspace routes to the archived workspace path", () => {
    expect(
      shouldRedirectArchivedWorkspace({
        isReady: true,
        hasSession: true,
        pathname: "/assist/fixed-assets",
        currentFiscalPeriod: period({ archiveStatus: "archived" }),
      }),
    ).toBe(true);
    expect(
      shouldRedirectArchivedWorkspace({
        isReady: true,
        hasSession: true,
        pathname: ARCHIVED_WORKSPACE_PATH,
        currentFiscalPeriod: period({ archiveStatus: "archived" }),
      }),
    ).toBe(false);
  });
});

function period(overrides: Partial<FiscalPeriod> = {}): FiscalPeriod {
  return {
    id: "fp-1",
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
    ...overrides,
  };
}
