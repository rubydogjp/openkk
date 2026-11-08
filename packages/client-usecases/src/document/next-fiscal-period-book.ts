"use client";

import { useCallback } from "react";
import {
  buildFiscalPeriodBookFilename,
  type FiscalPeriodArchivePayload,
} from "@rubydogjp/openkk-client-domain";
import type {
  FiscalPeriodCarryoverFromArchiveApplyInput,
  FiscalPeriodNextCreateInput,
} from "@rubydogjp/openkk-client-ports";

import { useFiscalPeriodArchivePayload } from "../shared/fiscal-period-archive-export.js";
import { useOpenkkAppState } from "../shared/openkk-app-state.js";
import { useOpenkkDocument } from "./document-context.js";

function carryoverFromArchive(
  archive: FiscalPeriodArchivePayload,
  input: FiscalPeriodNextCreateInput,
): FiscalPeriodCarryoverFromArchiveApplyInput {
  const reversalEntryIds = new Set(input.reversalEntryIds);
  return {
    archive,
    carryBalances: input.carryBalances,
    reversalEntryIndexes: archive.entries.flatMap((entry, index) =>
      typeof entry.id === "string" && reversalEntryIds.has(entry.id)
        ? [index]
        : [],
    ),
    carryFixedAssets: input.carryFixedAssets,
  };
}

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
        carryover: carryoverFromArchive(
          await buildArchivePayload(source),
          input,
        ),
      });
    },
    [appState.fiscalPeriods, buildArchivePayload, openNextBook],
  );
  return openNextBook == null ? null : create;
}
