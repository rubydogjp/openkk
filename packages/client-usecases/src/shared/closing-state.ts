"use client";

import { useMemo } from "react";
import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkAppState } from "./openkk-app-state.js";
import { useOpenkkConfig } from "./openkk-config-context.js";
import { assertEditingUnlocked } from "./editing-policy.js";
import type { EntryUpsertInput } from "@rubydogjp/openkk-client-ports";

export type OpenkkClosing = {
  runPreClosing: (fiscalPeriodId: string, year: number) => Promise<void>;
  runFinal: (
    fiscalPeriodId: string,
    year: number,
    entries: EntryUpsertInput[],
  ) => Promise<void>;
  cancelPreClosing: (fiscalPeriodId: string, year: number) => Promise<void>;
};

export function useOpenkkClosing(): OpenkkClosing {
  const backendApi = useBackendApi();
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  return useMemo<OpenkkClosing>(
    () => ({
      async runPreClosing(fiscalPeriodId, year) {
        assertEditingUnlocked(config, "closing.runPreClosing");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.preClosing.run({ fiscalPeriodId, year });
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
      async runFinal(fiscalPeriodId, year, entries) {
        assertEditingUnlocked(config, "closing.runFinal");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.closing.run({
          fiscalPeriodId,
          year,
          entries,
        });
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
      async cancelPreClosing(fiscalPeriodId, year) {
        assertEditingUnlocked(config, "closing.cancelPreClosing");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.preClosing.cancel(fiscalPeriodId, year);
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
    }),
    [appState, backendApi, config],
  );
}
