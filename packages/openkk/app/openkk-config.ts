import {
  createSystemClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import { parseOpenkkEnv } from "@rubydogjp/openkk-frontend";

const BUNDLE = "original";

const env = parseOpenkkEnv(process.env.NEXT_PUBLIC_OPENKK_ENV ?? null);
const userId = "openkk-original-user";

export const openkkConfig: OpenkkConfig = {
  clock: createSystemClock(),
  env,
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
};
