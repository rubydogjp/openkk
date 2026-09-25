import type { EmbeddedUser } from "./user.js";

export type OpenkkEnv = "dev" | "stg" | "prod";

export type OpenkkAuthMode = "embedded" | "custom";

export type FiscalPeriodArchiveRetention = "persistent" | "ephemeral";
export type FiscalPeriodPolicy = {
  maxActivePeriods: number | null;
  archiveRetention: FiscalPeriodArchiveRetention;
  ephemeralArchiveWarning: EphemeralArchiveWarning;
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
  ephemeralArchiveWarning: {
    title: "この先は元に戻せません",
    body: "次へ進むと、この会計期間の圧縮済みデータはサーバから削除され、二度とダウンロードできません。必要な場合は先にダウンロードしてください。",
    confirmLabel: "理解して次期を作成",
  },
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
  env: OpenkkEnv;
  bundleLabel: string;
  authMode: OpenkkAuthMode;
  embeddedUser: EmbeddedUser;
  initialFiscalPeriodId: string | null;
  sessionStorageKey: string;
  fiscalPeriodStorageKey: string;
  fiscalPeriodPolicy: FiscalPeriodPolicy;
  editingPolicy: EditingPolicy;
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
