export type OpenkkMode = "prod" | "stg" | "dev" | "demo";

export interface OpenkkConfig {
  today: Date;
  mode: OpenkkMode;
  isProdMode: boolean;
  isDevMode: boolean;
  isDemoMode: boolean;
  isMockMode: boolean;
  mockUserId: string;
  initialMockUserId: string | null;
  initialMockFiscalPeriodId: string | null;
  sessionStorageKey: string;
  fiscalPeriodStorageKey: string;
}
