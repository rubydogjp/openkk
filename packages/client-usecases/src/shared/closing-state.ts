"use client";

import { useMemo } from "react";
import { useBackendApi } from "./backend-api-context";

export type OpenkkClosing = {
  getProvisional: (
    fiscalPeriodId: string,
    year: number,
  ) => Promise<{ isProvisional: boolean } | null>;
  runProvisional: (fiscalPeriodId: string, year: number) => Promise<void>;
  runFinal: (fiscalPeriodId: string, year: number) => Promise<void>;
  cancelProvisional: (fiscalPeriodId: string, year: number) => Promise<void>;
};

export function useOpenkkClosing(): OpenkkClosing {
  const backendApi = useBackendApi();
  return useMemo<OpenkkClosing>(
    () => ({
      async getProvisional(fiscalPeriodId, year) {
        return await backendApi.closing.get(fiscalPeriodId, year);
      },
      async runProvisional(fiscalPeriodId, year) {
        await backendApi.closing.run({
          fiscalPeriodId,
          year,
          isProvisional: true,
        });
      },
      async runFinal(fiscalPeriodId, year) {
        await backendApi.closing.run({
          fiscalPeriodId,
          year,
          isProvisional: false,
        });
      },
      async cancelProvisional(fiscalPeriodId, year) {
        await backendApi.closing.cancel(fiscalPeriodId, year);
      },
    }),
    [backendApi],
  );
}
