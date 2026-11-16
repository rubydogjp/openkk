"use client";

import { useState } from "react";
import type { OpenkkFiscalPeriodLabel } from "@rubydogjp/openkk-driver";

import { useOpenkkBookStorage, usePlatformAdapter } from "../bindings/index.js";

import { useOpenkkStandingNotice } from "../shared/notices/notices.js";

const LEGACY_UNMOVED_NOTICE_SEEN_KEY =
  "openkk.legacy-unmoved-fiscal-periods-notice.seen";
const SEEN_VALUE = "1";
const NO_UNMOVED_FISCAL_PERIODS: readonly OpenkkFiscalPeriodLabel[] = [];

export const LEGACY_UNMOVED_PERIOD_REASON = "移せませんでした";

export function legacyUnmovedFiscalPeriodsMessage(count: number): string {
  return `前の版から移せなかった会計期間が ${count} 件あります`;
}

export function useLegacyUnmovedFiscalPeriods(): readonly OpenkkFiscalPeriodLabel[] {
  return (
    useOpenkkBookStorage()?.legacyUnmovedFiscalPeriods ??
    NO_UNMOVED_FISCAL_PERIODS
  );
}

export function useLegacyUnmovedFiscalPeriodsNotice(hasSession: boolean): void {
  const unmovedCount = useLegacyUnmovedFiscalPeriods().length;
  const { storage } = usePlatformAdapter();
  const [seen, setSeen] = useState(
    () => storage.getItem(LEGACY_UNMOVED_NOTICE_SEEN_KEY) === SEEN_VALUE,
  );
  useOpenkkStandingNotice(
    "legacy-unmoved-fiscal-periods",
    hasSession && unmovedCount > 0 && !seen
      ? {
          tone: "warning",
          message: legacyUnmovedFiscalPeriodsMessage(unmovedCount),
          action: null,
          closable: true,
          onClose: () => {
            storage.setItem(LEGACY_UNMOVED_NOTICE_SEEN_KEY, SEEN_VALUE);
            setSeen(true);
          },
        }
      : null,
  );
}
