import { createFixedClock, type OpenkkConfig } from "@rubydogjp/openkk-client";
import { parseOpenkkEnv } from "@rubydogjp/openkk-frontend";

const BUNDLE = "sim";

const env = parseOpenkkEnv(process.env.NEXT_PUBLIC_OPENKK_ENV);
const userId = "openkk-sim-user";
const mockToday = new Date(2026, 8, 5);

export const openkkConfig: OpenkkConfig = {
  clock: createFixedClock(mockToday),
  env,
  bundleLabel: "Sim版",
  isMockMode: true,
  debugRoutesEnabled: true,
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: "開発ユーザー",
  },
  mockUserId: userId,
  initialMockUserId: userId,
  initialMockFiscalPeriodId: null,
  sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
  fiscalPeriodPolicy: null,
  editingPolicy: null,
};
