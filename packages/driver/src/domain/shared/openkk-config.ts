import type { EmbeddedUser } from "./user.js";

export type OpenkkAuthMode = "embedded" | "custom";

export type FiscalPeriodPolicy = {
  allowArchiveImport: boolean;
};

export const DEFAULT_FISCAL_PERIOD_POLICY: FiscalPeriodPolicy = {
  allowArchiveImport: true,
};

export type EditingPolicy = {
  locked: boolean;
  lockedNotice: string;
};

export const DEFAULT_EDITING_POLICY: EditingPolicy = {
  locked: false,
  lockedNotice: "この環境ではデータの編集がロックされています。",
};

export interface OpenkkClock {
  kind: "system" | "fixed";
  today(): Date;
}

export interface OpenkkConfig {
  clock: OpenkkClock;
  bundleLabel: string;
  authMode: OpenkkAuthMode;
  embeddedUser: EmbeddedUser;
  initialFiscalPeriodId: string | null;
  sessionStorageKey: string;
  fiscalPeriodStorageKey: string;
  fiscalPeriodPolicy: FiscalPeriodPolicy;
  editingPolicy: EditingPolicy;
  debugRoutesEnabled: boolean;
  myPagePath: string | null;
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
