"use client";

import { useMemo } from "react";
import { useBackendApi } from "./backend-api-context";
import { useOpenkkAppState } from "./openkk-app-state";

export type OpenkkClosing = {
  runPreClosing: (fiscalPeriodId: string, year: number) => Promise<void>;
  runFinal: (fiscalPeriodId: string, year: number) => Promise<void>;
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
      async runFinal(fiscalPeriodId, year) {
        syncFiscalPeriod(
          await backendApi.closing.run({ fiscalPeriodId, year }),
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
