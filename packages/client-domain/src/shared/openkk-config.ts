import type { EmbeddedUser } from "./user";

export type OpenkkMode = "prod" | "stg" | "dev" | "demo";

export type OpenkkAuthMode = "embedded" | "custom";

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
}
