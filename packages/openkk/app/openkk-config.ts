import type { OpenkkConfig } from "@rubydogjp/openkk-client";
import { parseOpenkkEnv } from "@rubydogjp/openkk-frontend";

const BUNDLE = "original";

const env = parseOpenkkEnv(process.env.NEXT_PUBLIC_OPENKK_ENV);
const userId = "openkk-original-user";

export const openkkConfig: OpenkkConfig = {
  today: new Date(),
  env,
  bundle: BUNDLE,
  bundleLabel: "無印版",
  isMockMode: false,
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: "このPCのデータ",
  },
  mockUserId: userId,
  initialMockUserId: null,
  initialMockFiscalPeriodId: null,
  sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
};
