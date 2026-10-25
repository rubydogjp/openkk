import type { FiscalPeriod } from "@rubydogjp/openkk-client-domain";

export const FISCAL_PERIOD_PICKER_PATH = "/fiscal-periods";
export const FISCAL_PERIOD_CREATE_PATH = "/fiscal-periods/new";
export const ARCHIVED_FISCAL_PERIOD_PATH = "/steps";
export const NEXT_FISCAL_PERIOD_STEP_PATH = "/steps/next-fiscal-period";

export type ShellContentMode =
  "loading" | "sign-in" | "fiscal-periods" | "archived" | "normal";

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
    input.currentFiscalPeriodId == null &&
    input.pathname !== FISCAL_PERIOD_CREATE_PATH
  ) {
    return "fiscal-periods";
  }
  if (showsArchivedFiscalPeriod(input.pathname, input.currentFiscalPeriod)) {
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
  if (input.currentFiscalPeriodId != null) return false;
  return (
    input.pathname !== FISCAL_PERIOD_PICKER_PATH &&
    input.pathname !== FISCAL_PERIOD_CREATE_PATH
  );
}

export function shouldRedirectArchivedFiscalPeriod(input: {
  isReady: boolean;
  hasSession: boolean;
  pathname: string;
  currentFiscalPeriod: FiscalPeriod | null;
}): boolean {
  if (!input.isReady) return false;
  if (!input.hasSession) return false;
  if (!showsArchivedFiscalPeriod(input.pathname, input.currentFiscalPeriod)) {
    return false;
  }
  return input.pathname !== ARCHIVED_FISCAL_PERIOD_PATH;
}

function showsArchivedFiscalPeriod(
  pathname: string,
  period: FiscalPeriod | null,
): boolean {
  if (period == null || period.archiveStatus === "active") return false;
  if (
    pathname === FISCAL_PERIOD_PICKER_PATH ||
    pathname === FISCAL_PERIOD_CREATE_PATH
  ) {
    return false;
  }
  return !(
    period.archiveStatus === "archived" &&
    pathname === NEXT_FISCAL_PERIOD_STEP_PATH
  );
}
