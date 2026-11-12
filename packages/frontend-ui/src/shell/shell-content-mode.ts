import type { FiscalPeriod } from "@rubydogjp/openkk-driver";

export const FISCAL_PERIOD_PICKER_PATH = "/fiscal-periods";
export const FISCAL_PERIOD_CREATE_PATH = "/fiscal-periods/new";
export const LEGACY_PURGED_FISCAL_PERIOD_PATH = "/steps";

export type ShellContentMode =
  "loading" | "sign-in" | "fiscal-periods" | "legacy-purged" | "normal";

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
  if (
    showsLegacyPurgedFiscalPeriod(input.pathname, input.currentFiscalPeriod)
  ) {
    return "legacy-purged";
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

export function shouldRedirectLegacyPurgedFiscalPeriod(input: {
  isReady: boolean;
  hasSession: boolean;
  pathname: string;
  currentFiscalPeriod: FiscalPeriod | null;
}): boolean {
  if (!input.isReady) return false;
  if (!input.hasSession) return false;
  if (
    !showsLegacyPurgedFiscalPeriod(input.pathname, input.currentFiscalPeriod)
  ) {
    return false;
  }
  return input.pathname !== LEGACY_PURGED_FISCAL_PERIOD_PATH;
}

function showsLegacyPurgedFiscalPeriod(
  pathname: string,
  period: FiscalPeriod | null,
): boolean {
  if (period == null || period.archiveStatus !== "purged") return false;
  return (
    pathname !== FISCAL_PERIOD_PICKER_PATH &&
    pathname !== FISCAL_PERIOD_CREATE_PATH
  );
}
