import {
  createFixedClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";

const BUNDLE = "sim";

const userId = "openkk-sim-user";
const fixedToday = new Date(2026, 8, 5);

export const openkkConfig: OpenkkConfig = {
  clock: createFixedClock(fixedToday),
  bundleLabel: "Sim版",
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: "開発ユーザー",
  },
  initialFiscalPeriodId: null,
  sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
  fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
  editingPolicy: DEFAULT_EDITING_POLICY,
  debugRoutesEnabled: true,
  myPagePath: null,
};
