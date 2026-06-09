import type { OpenkkConfig } from "@rubydogjp/openkk-client";
import { parseOpenkkEnv } from "@rubydogjp/openkk-frontend";

import { demoEditingPolicy, demoFiscalPeriodPolicy } from "../demo/demo-bundle";

const BUNDLE = "demo";

const env = parseOpenkkEnv(process.env.NEXT_PUBLIC_OPENKK_ENV);
const userId = "openkk-demo-user";
const mockToday = new Date(2026, 8, 5);

export const openkkConfig: OpenkkConfig = {
  today: new Date(mockToday),
  env,
  bundleLabel: "デモ版",
  isMockMode: true,
  authMode: "embedded",
  embeddedUser: {
    kind: "embedded",
    id: userId,
    displayName: "デモユーザー",
  },
  mockUserId: userId,
  initialMockUserId: userId,
  initialMockFiscalPeriodId: "fp-2026",
  sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
  fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
  fiscalPeriodPolicy: demoFiscalPeriodPolicy,
  editingPolicy: demoEditingPolicy,
};
