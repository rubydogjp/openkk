import type { EmbeddedUser } from "./user";

export type OpenkkMode = "prod" | "stg" | "dev" | "demo";

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
};

export const DEFAULT_FISCAL_PERIOD_POLICY: FiscalPeriodPolicy = {
  maxActivePeriods: null,
  archiveRetention: "persistent",
};

export interface OpenkkConfig {
  today: Date;
  mode: OpenkkMode;
  isProdMode: boolean;
  isDevMode: boolean;
  isDemoMode: boolean;
  isMockMode: boolean;
  authMode: OpenkkAuthMode;
  embeddedUser: EmbeddedUser;
  mockUserId: string;
  initialMockUserId: string | null;
  initialMockFiscalPeriodId: string | null;
  sessionStorageKey: string;
  fiscalPeriodStorageKey: string;
  fiscalPeriodPolicy?: FiscalPeriodPolicy;
}

export function resolveFiscalPeriodPolicy(
  config: Pick<OpenkkConfig, "fiscalPeriodPolicy">,
): FiscalPeriodPolicy {
  return config.fiscalPeriodPolicy ?? DEFAULT_FISCAL_PERIOD_POLICY;
}
