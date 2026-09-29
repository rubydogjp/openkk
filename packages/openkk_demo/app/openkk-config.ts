import {
  createFixedClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import { parseOpenkkEnv } from "@rubydogjp/openkk-frontend";

const BUNDLE = "demo";

const env = parseOpenkkEnv(process.env.NEXT_PUBLIC_OPENKK_ENV ?? null);
const userId = "openkk-demo-user";
const fixedToday = new Date(2026, 8, 5);

export const openkkConfig: OpenkkConfig = {
  clock: createFixedClock(fixedToday),
  env,
  bundleLabel: "デモ版",
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: "デモユーザー",
  },
  initialFiscalPeriodId: "fp-2026",
  sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
  fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
  editingPolicy: DEFAULT_EDITING_POLICY,
  debugRoutesEnabled: false,
  myPagePath: null,
};
