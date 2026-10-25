"use client";

import { useCallback } from "react";
import {
  buildFiscalPeriodArchivePayload,
  closingYear,
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
      const year = closingYear(fiscalPeriod);
      const [entries, fixedAssets, preClosed, closed] = await Promise.all([
        backendApi.entries.getAll(fiscalPeriod.id),
        backendApi.fixedAssets.getAll(fiscalPeriod.id),
        backendApi.preClosings.get(fiscalPeriod.id, year),
        backendApi.closings.get(fiscalPeriod.id, year),
      ]);
      appState.assertAuthOperationCurrent(authOperationVersion);
      const closing = (kind: "pre_closing" | "closing") => ({
        fiscalPeriodId: fiscalPeriod.id,
        year,
        kind,
      });
      return createFiscalPeriodArchiveZip(
        buildFiscalPeriodArchivePayload({
          createdAt: new Date().toISOString(),
          fiscalPeriod: { ...fiscalPeriod, archiveStatus: "archived" },
          entries: entries.map((entry) => ({ ...entry })),
          fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
          closings: [
            ...(preClosed ? [closing("pre_closing")] : []),
            ...(closed ? [closing("closing")] : []),
          ],
        }),
      );
    },
    [appState, backendApi],
  );
}
