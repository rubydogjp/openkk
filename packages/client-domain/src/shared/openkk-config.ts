import type { EmbeddedUser } from "./user.js";

export type OpenkkEnv = "dev" | "stg" | "prod";

export type OpenkkAuthMode = "embedded" | "custom";

export type FiscalPeriodArchiveRetention = "persistent" | "ephemeral";
export type FiscalPeriodPolicy = {
  maxActivePeriods: number | null;
  archiveRetention: FiscalPeriodArchiveRetention;
  ephemeralArchiveWarning?: {
    title?: string;
    body?: string;
    confirmLabel?: string;
  };
  allowArchiveImport?: boolean;
};

export const DEFAULT_FISCAL_PERIOD_POLICY: FiscalPeriodPolicy = {
  maxActivePeriods: null,
  archiveRetention: "persistent",
  allowArchiveImport: true,
};

export type OpenkkEditingPolicy = {
  locked?: boolean;
  lockedNotice?: string;
};

export interface OpenkkClock {
  kind: "system" | "fixed";
  today(): Date;
}

export interface OpenkkConfig {
  clock: OpenkkClock;
  env: OpenkkEnv;
  bundleLabel: string;
  isMockMode: boolean;
  authMode: OpenkkAuthMode;
  embeddedUser: EmbeddedUser;
  mockUserId: string;
  initialMockUserId: string | null;
  initialMockFiscalPeriodId: string | null;
  sessionStorageKey: string;
  fiscalPeriodStorageKey: string;
  fiscalPeriodPolicy?: FiscalPeriodPolicy;
  editingPolicy?: OpenkkEditingPolicy;
  debugRoutesEnabled?: boolean;
}

export function createSystemClock(
  currentDate: () => Date = () => new Date(),
): OpenkkClock {
  return {
    kind: "system",
    today: () => new Date(currentDate()),
  };
}

export function createFixedClock(today: Date): OpenkkClock {
  const timestamp = today.getTime();
  return {
    kind: "fixed",
    today: () => new Date(timestamp),
  };
}

export function resolveEditingPolicy(
  config: Pick<OpenkkConfig, "editingPolicy">,
): { locked: boolean; lockedNotice?: string } {
  return {
    locked: config.editingPolicy?.locked ?? false,
    lockedNotice: config.editingPolicy?.lockedNotice,
  };
}

export function resolveFiscalPeriodPolicy(
  config: Pick<OpenkkConfig, "fiscalPeriodPolicy">,
): FiscalPeriodPolicy {
  return config.fiscalPeriodPolicy ?? DEFAULT_FISCAL_PERIOD_POLICY;
}
