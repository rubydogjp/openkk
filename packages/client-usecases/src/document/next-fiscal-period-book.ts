"use client";

import { useCallback } from "react";
import { buildFiscalPeriodBookFilename } from "@rubydogjp/openkk-client-domain";
import type { FiscalPeriodNextCreateInput } from "@rubydogjp/openkk-client-ports";

import { useFiscalPeriodArchivePayload } from "../shared/fiscal-period-archive-export.js";
import { carryoverFromArchive } from "../shared/opening-carryover.js";
import { useOpenkkAppState } from "../shared/openkk-app-state.js";
import { useOpenkkDocument } from "./document-context.js";

export function useNextFiscalPeriodBook():
  ((input: FiscalPeriodNextCreateInput) => Promise<void>) | null {
  const document = useOpenkkDocument();
  const appState = useOpenkkAppState();
  const buildArchivePayload = useFiscalPeriodArchivePayload();
  const openNextBook = document?.openNextBook ?? null;
  const create = useCallback(
    async (input: FiscalPeriodNextCreateInput) => {
      if (openNextBook == null) return;
      const source = appState.fiscalPeriods.find(
        (period) => period.id === input.sourceFiscalPeriodId,
      );
      if (source == null) {
        throw new Error(
          `fiscal period not found: ${input.sourceFiscalPeriodId}`,
        );
      }
      await openNextBook({
        fileName: buildFiscalPeriodBookFilename(input),
        fiscalPeriod: {
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        carryover: carryoverFromArchive(await buildArchivePayload(source), {
          carryBalances: input.carryBalances,
          reversalEntryIds: input.reversalEntryIds,
          carryFixedAssets: input.carryFixedAssets,
        }),
      });
    },
    [appState.fiscalPeriods, buildArchivePayload, openNextBook],
  );
  return openNextBook == null ? null : create;
}
