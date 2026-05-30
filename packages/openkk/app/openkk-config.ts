import type { OpenkkConfig, OpenkkMode } from "@rubydogjp/openkk-client";

const openkkMode = parseOpenkkMode(process.env.NEXT_PUBLIC_OPENKK_MODE);
const userId =
  openkkMode === "demo"
    ? "openkk-demo-user"
    : openkkMode === "dev"
      ? "openkk-dev-user"
      : "openkk-prod-user";
const mockToday = new Date(2026, 8, 5);
const useMockClock = openkkMode === "demo" || openkkMode === "dev";

export const openkkConfig: OpenkkConfig = {
  today: useMockClock ? new Date(mockToday) : new Date(),
  mode: openkkMode,
  isProdMode: openkkMode === "prod",
  isDevMode: openkkMode === "dev",
  isDemoMode: openkkMode === "demo",
  isMockMode: useMockClock,
  mockUserId: userId,
  initialMockUserId: userId,

  initialMockFiscalPeriodId: openkkMode === "demo" ? "fp-2026" : null,
  sessionStorageKey: `openkk.${openkkMode}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${openkkMode}.fiscal_period_id`,
};

function parseOpenkkMode(value: string | undefined): OpenkkMode {
  switch (value) {
    case "dev":
    case "demo":
    case "stg":
    case "prod":
      return value;
    default:
      return "prod";
  }
}
