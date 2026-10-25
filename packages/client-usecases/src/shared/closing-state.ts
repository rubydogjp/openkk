"use client";

import { useMemo } from "react";
import {
  closingYear,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";
import type { EntryUpsertInput } from "@rubydogjp/openkk-client-ports";

import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkAppState } from "./openkk-app-state.js";
import { useOpenkkConfig } from "./openkk-config-context.js";
import { assertEditingUnlocked } from "./editing-policy.js";

export type OpenkkClosing = {
  runPreClosing: (fiscalPeriod: FiscalPeriod) => Promise<void>;
  runFinal: (
    fiscalPeriod: FiscalPeriod,
    entries: EntryUpsertInput[],
  ) => Promise<void>;
  cancelPreClosing: (fiscalPeriod: FiscalPeriod) => Promise<void>;
};

export function useOpenkkClosing(): OpenkkClosing {
  const backendApi = useBackendApi();
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  return useMemo<OpenkkClosing>(
    () => ({
      async runPreClosing(fiscalPeriod) {
        assertEditingUnlocked(config.editingPolicy, "closing.runPreClosing");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.preClosings.run(
          fiscalPeriod.id,
          closingYear(fiscalPeriod),
        );
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
      async runFinal(fiscalPeriod, entries) {
        assertEditingUnlocked(config.editingPolicy, "closing.runFinal");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.closings.run(
          fiscalPeriod.id,
          closingYear(fiscalPeriod),
          entries,
        );
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
      async cancelPreClosing(fiscalPeriod) {
        assertEditingUnlocked(config.editingPolicy, "closing.cancelPreClosing");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const period = await backendApi.preClosings.cancel(
          fiscalPeriod.id,
          closingYear(fiscalPeriod),
        );
        appState.assertAuthOperationCurrent(authOperationVersion);
        appState.syncFiscalPeriod(period);
      },
    }),
    [appState, backendApi, config],
  );
}
