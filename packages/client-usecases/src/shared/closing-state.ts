"use client";

import { useMemo } from "react";
import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkAppState } from "./openkk-app-state.js";
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
  const { syncFiscalPeriod } = useOpenkkAppState();
  return useMemo<OpenkkClosing>(
    () => ({
      async runPreClosing(fiscalPeriodId, year) {
        syncFiscalPeriod(
          await backendApi.preClosing.run({ fiscalPeriodId, year }),
        );
      },
      async runFinal(fiscalPeriodId, year, entries) {
        syncFiscalPeriod(
          await backendApi.closing.run({ fiscalPeriodId, year, entries }),
        );
      },
      async cancelPreClosing(fiscalPeriodId, year) {
        syncFiscalPeriod(
          await backendApi.preClosing.cancel(fiscalPeriodId, year),
        );
      },
    }),
    [backendApi, syncFiscalPeriod],
  );
}
