"use client";

import { useMemo } from "react";
import type { EntryUpsertInput } from "@rubydogjp/openkk-client-ports";

import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkAppState } from "./openkk-app-state.js";
import { useOpenkkConfig } from "./openkk-config-context.js";
import { assertEditingUnlocked } from "./editing-policy.js";

export type OpenkkClosing = {
  runPreClosing: (fiscalPeriodId: string) => Promise<void>;
  runFinal: (
    fiscalPeriodId: string,
    entries: EntryUpsertInput[],
  ) => Promise<void>;
  cancelPreClosing: (fiscalPeriodId: string) => Promise<void>;
};

export function useOpenkkClosing(): OpenkkClosing {
  const backendApi = useBackendApi();
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  return useMemo<OpenkkClosing>(
    () => ({
      async runPreClosing(fiscalPeriodId) {
        assertEditingUnlocked(config.editingPolicy, "closing.runPreClosing");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.preClosings.run(fiscalPeriodId);
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
      async runFinal(fiscalPeriodId, entries) {
        assertEditingUnlocked(config.editingPolicy, "closing.runFinal");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.closings.run(fiscalPeriodId, entries);
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
      async cancelPreClosing(fiscalPeriodId) {
        assertEditingUnlocked(config.editingPolicy, "closing.cancelPreClosing");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.preClosings.cancel(fiscalPeriodId);
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
    }),
    [appState, backendApi, config],
  );
}
