"use client";

import { useCallback } from "react";
import {
  archiveClosingRecords,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";

import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkAppState } from "./openkk-app-state.js";

export function useFiscalPeriodArchiveExport(): (
  fiscalPeriod: FiscalPeriod,
) => Promise<Uint8Array> {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  return useCallback(
    async (fiscalPeriod) => {
      const authOperationVersion = appState.captureAuthOperationVersion();
      const [entries, fixedAssets] = await Promise.all([
        backendApi.entries.getAll(fiscalPeriod.id),
        backendApi.fixedAssets.getAll(fiscalPeriod.id),
      ]);
      appState.assertAuthOperationCurrent(authOperationVersion);
      return createFiscalPeriodArchiveZip(
        buildFiscalPeriodArchivePayload({
          createdAt: new Date().toISOString(),
          fiscalPeriod: { ...fiscalPeriod, archiveStatus: "archived" },
          entries: entries.map((entry) => ({ ...entry })),
          fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
          closings: archiveClosingRecords(fiscalPeriod),
        }),
      );
    },
    [appState, backendApi],
  );
}
