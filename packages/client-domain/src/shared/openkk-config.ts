import type { EmbeddedUser } from "./user.js";

export type OpenkkEnv = "dev" | "stg" | "prod";

export type OpenkkAuthMode = "embedded" | "custom";

export type FiscalPeriodArchiveRetention = "persistent" | "ephemeral";
export type FiscalPeriodPolicy = {
  maxActivePeriods: number | null;
  archiveRetention: FiscalPeriodArchiveRetention;
  ephemeralArchiveWarning: EphemeralArchiveWarning | null;
  allowArchiveImport: boolean;
};

export type EphemeralArchiveWarning = {
  title: string;
  body: string;
  confirmLabel: string;
};

export const DEFAULT_FISCAL_PERIOD_POLICY: FiscalPeriodPolicy = {
  maxActivePeriods: null,
  archiveRetention: "persistent",
  ephemeralArchiveWarning: null,
  allowArchiveImport: true,
};

export type OpenkkEditingPolicy = {
  locked: boolean;
  lockedNotice: string | null;
};

export const DEFAULT_EDITING_POLICY: OpenkkEditingPolicy = {
  locked: false,
  lockedNotice: null,
};

export interface OpenkkClock {
  kind: "system" | "fixed";
  today(): Date;
}

export interface OpenkkConfig {
  clock: OpenkkClock;
  env: OpenkkEnv;
  bundleLabel: string;
  authMode: OpenkkAuthMode;
  embeddedUser: EmbeddedUser;
  initialFiscalPeriodId: string | null;
  sessionStorageKey: string;
  fiscalPeriodStorageKey: string;
  fiscalPeriodPolicy: FiscalPeriodPolicy;
  editingPolicy: OpenkkEditingPolicy;
  debugRoutesEnabled: boolean;
}

export function createSystemClock(): OpenkkClock {
  return {
    kind: "system",
    today: () => new Date(),
  };
}

export function createFixedClock(today: Date): OpenkkClock {
  const timestamp = today.getTime();
  return {
    kind: "fixed",
    today: () => new Date(timestamp),
  };
}
