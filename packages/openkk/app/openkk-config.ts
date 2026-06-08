import type { OpenkkConfig, OpenkkMode } from "@rubydogjp/openkk-client";

const openkkMode = parseOpenkkMode(process.env.NEXT_PUBLIC_OPENKK_MODE);
const userId = openkkMode === "dev" ? "openkk-dev-user" : "openkk-prod-user";
const mockToday = new Date(2026, 8, 5);
const useMockClock = openkkMode === "dev";

const embeddedUserDisplayName =
  openkkMode === "dev" ? "開発ユーザー" : "このPCのデータ";

export const openkkConfig: OpenkkConfig = {
  today: useMockClock ? new Date(mockToday) : new Date(),
  mode: openkkMode,
  isProdMode: openkkMode === "prod",
  isDevMode: openkkMode === "dev",
  isMockMode: useMockClock,
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: embeddedUserDisplayName,
  },
  mockUserId: userId,
  initialMockUserId: useMockClock ? userId : null,

  initialMockFiscalPeriodId: null,
  sessionStorageKey: `openkk.${openkkMode}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${openkkMode}.fiscal_period_id`,
};

function parseOpenkkMode(value: string | undefined): OpenkkMode {
  switch (value) {
    case "dev":
    case "stg":
    case "prod":
      return value;
    default:
      return "prod";
  }
}
