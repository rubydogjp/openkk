"use client";

import { useState } from "react";
import type { OpenkkFiscalPeriodLabel } from "@rubydogjp/openkk-driver";

import { useOpenkkBookStorage, usePlatformAdapter } from "../bindings/index.js";

import { useOpenkkStandingNotice } from "../shared/notices/notices.js";

const LEGACY_MERGED_NOTICE_SEEN_KEY =
  "openkk.legacy-merged-fiscal-periods-notice.seen";
const SEEN_VALUE = "1";
const NO_MERGED_FISCAL_PERIODS: readonly OpenkkFiscalPeriodLabel[] = [];

export function legacyMergedFiscalPeriodsMessage(
  mergedFiscalPeriods: readonly OpenkkFiscalPeriodLabel[],
): string {
  const [first] = mergedFiscalPeriods;
  if (mergedFiscalPeriods.length === 1 && first?.name != null) {
    return `前の版で「${first.name}」が 2 つあったので、1 つにまとめました`;
  }
  return `前の版で同じ会計期間が 2 つあったものを、${mergedFiscalPeriods.length} 件まとめました`;
}

export function useLegacyMergedFiscalPeriodsNotice(hasSession: boolean): void {
  const mergedFiscalPeriods =
    useOpenkkBookStorage()?.legacyMergedFiscalPeriods ??
    NO_MERGED_FISCAL_PERIODS;
  const { storage } = usePlatformAdapter();
  const [seen, setSeen] = useState(
    () => storage.getItem(LEGACY_MERGED_NOTICE_SEEN_KEY) === SEEN_VALUE,
  );
  useOpenkkStandingNotice(
    "legacy-merged-fiscal-periods",
    hasSession && mergedFiscalPeriods.length > 0 && !seen
      ? {
          tone: "success",
          message: legacyMergedFiscalPeriodsMessage(mergedFiscalPeriods),
          action: null,
          closable: true,
          onClose: () => {
            storage.setItem(LEGACY_MERGED_NOTICE_SEEN_KEY, SEEN_VALUE);
            setSeen(true);
          },
        }
      : null,
  );
}
