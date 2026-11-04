import {
  createSystemClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";

const BUNDLE = "file";

export const BUNDLE_LABEL = "ファイル版";

export const BOOK_OWNER_USER_ID = "openkk-original-user";

export function buildDocumentConfig(fileName: string): OpenkkConfig {
  return {
    clock: createSystemClock(),
    bundleLabel: BUNDLE_LABEL,
    authMode: "embedded",
    embeddedUser: {
      kind: "embedded",
      id: BOOK_OWNER_USER_ID,
      displayName: fileName,
    },
    initialFiscalPeriodId: null,
    sessionStorageKey: `openkk.${BUNDLE}.session.user_id`,
    fiscalPeriodStorageKey: `openkk.${BUNDLE}.fiscal_period_id`,
    fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
    editingPolicy: DEFAULT_EDITING_POLICY,
    debugRoutesEnabled: false,
    myPagePath: null,
  };
}
