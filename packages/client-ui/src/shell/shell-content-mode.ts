import type { FiscalPeriod } from "@rubydogjp/openkk-client-domain";

export const FISCAL_PERIOD_PICKER_PATH = "/fiscal-periods";
export const FISCAL_PERIOD_CREATE_PATH = "/fiscal-periods/new";
export const ARCHIVED_WORKSPACE_PATH = "/steps";

export type ShellContentMode =
  | "loading"
  | "sign-in"
  | "fiscal-periods"
  | "archived"
  | "normal";

export function resolveShellContentMode(input: {
  isReady: boolean;
  hasSession: boolean;
  pathname: string;
  currentFiscalPeriodId: string | null;
  currentFiscalPeriod: FiscalPeriod | null;
}): ShellContentMode {
  if (!input.isReady) return "loading";
  if (!input.hasSession) return "sign-in";
  if (input.pathname === FISCAL_PERIOD_PICKER_PATH) return "fiscal-periods";
  if (
    !hasSelectedFiscalPeriod(input.currentFiscalPeriodId) &&
    input.pathname !== FISCAL_PERIOD_CREATE_PATH
  ) {
    return "fiscal-periods";
  }
  if (isArchivedWorkspace(input.pathname, input.currentFiscalPeriod)) {
    return "archived";
  }
  return "normal";
}

export function shouldRedirectMissingFiscalPeriod(input: {
  isReady: boolean;
  hasSession: boolean;
  pathname: string;
  currentFiscalPeriodId: string | null;
}): boolean {
  if (!input.isReady) return false;
  if (!input.hasSession) return false;
  if (hasSelectedFiscalPeriod(input.currentFiscalPeriodId)) return false;
  return (
    input.pathname !== FISCAL_PERIOD_PICKER_PATH &&
    input.pathname !== FISCAL_PERIOD_CREATE_PATH
  );
}

export function shouldRedirectArchivedWorkspace(input: {
  isReady: boolean;
  hasSession: boolean;
  pathname: string;
  currentFiscalPeriod: FiscalPeriod | null;
}): boolean {
  if (!input.isReady) return false;
  if (!input.hasSession) return false;
  if (!isArchivedWorkspace(input.pathname, input.currentFiscalPeriod)) {
    return false;
  }
  return input.pathname !== ARCHIVED_WORKSPACE_PATH;
}

function hasSelectedFiscalPeriod(id: string | null): boolean {
  return id != null && id !== "";
}

function isArchivedWorkspace(
  pathname: string,
  period: FiscalPeriod | null,
): boolean {
  return (
    period?.archived === true &&
    pathname !== FISCAL_PERIOD_PICKER_PATH &&
    pathname !== FISCAL_PERIOD_CREATE_PATH
  );
}
