import {
  createSystemClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";

const BUNDLE = "original";

export const BUNDLE_LABEL = "無印版";

export const BOOK_OWNER_USER_ID = "openkk-original-user";

export const DEBUG_ROUTES_ENABLED = false;

export const LAST_BOOK_STORAGE_KEY = `openkk.${BUNDLE}.last_book`;

export function buildBookConfig(
  displayName: string,
  initialFiscalPeriodId: string | null,
): OpenkkConfig {
  return {
    clock: createSystemClock(),
    bundleLabel: BUNDLE_LABEL,
    authMode: "embedded",
    embeddedUser: {
      kind: "embedded",
      id: BOOK_OWNER_USER_ID,
      displayName,
    },
    initialFiscalPeriodId,
    sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
    fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
    fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
    editingPolicy: DEFAULT_EDITING_POLICY,
    debugRoutesEnabled: DEBUG_ROUTES_ENABLED,
    myPagePath: null,
  };
}

export const START_CONFIG = buildBookConfig(BUNDLE_LABEL, null);
