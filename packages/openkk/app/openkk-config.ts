import {
  createSystemClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";

const BUNDLE = "original";

const userId = "openkk-original-user";

export const openkkConfig: OpenkkConfig = {
  clock: createSystemClock(),
  bundleLabel: "無印版",
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: "このPCのデータ",
  },
  initialFiscalPeriodId: null,
  sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
  fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
  editingPolicy: DEFAULT_EDITING_POLICY,
  debugRoutesEnabled: false,
  myPagePath: null,
};
