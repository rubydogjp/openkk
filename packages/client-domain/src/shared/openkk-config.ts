import type { EmbeddedUser } from "./user";

export type OpenkkEnv = "dev" | "stg" | "prod";

export type OpenkkBundle = "demo" | "sim" | "original";

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

export interface OpenkkConfig {
  today: Date;
  env: OpenkkEnv;
  bundle: OpenkkBundle;
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
