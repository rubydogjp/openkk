"use client";

import { useEffect, useMemo, useState } from "react";
import {
  storedEntryToRecord,
  type EntryRecord,
  type FiscalPeriod,
  type FiscalPeriodArchivePayload,
} from "@rubydogjp/openkk-client-domain";
import type {
  FiscalPeriodCarryoverFromArchiveApplyInput,
  OpenkkOtherBookPeriod,
} from "@rubydogjp/openkk-client-ports";

import { useOtherBookPeriodsReader } from "../document/document-context.js";
import { useOpenkkEntries } from "../entries/entries-state.js";
import { archivePayloadFromRecords } from "./fiscal-period-archive-export.js";
import { mapRemoteFiscalPeriod } from "./fiscal-period-list.js";
import { useOpenkkAppState } from "./openkk-app-state.js";

export type OpeningCarryoverChoice = {
  carryBalances: boolean;
  reversalEntryIds: string[] | null;
  carryFixedAssets: boolean;
};

export type OpeningCarryoverSource = {
  key: string;
  label: string;
  fiscalPeriod: FiscalPeriod;
  loadEntries(): Promise<EntryRecord[]>;
  apply(targetId: string, choice: OpeningCarryoverChoice): Promise<void>;
};

export function isOpeningCarryoverSourceFor(
  target: FiscalPeriod,
  period: FiscalPeriod,
): boolean {
  return (
    period.id !== target.id &&
    period.phase === "post_closing" &&
    period.documentsReceivedCompleted &&
    period.archiveStatus !== "purged" &&
    period.endDate < target.startDate
  );
}

export function carryoverFromArchive(
  archive: FiscalPeriodArchivePayload,
  choice: OpeningCarryoverChoice,
): FiscalPeriodCarryoverFromArchiveApplyInput {
  const reversalEntryIds =
    choice.reversalEntryIds == null ? null : new Set(choice.reversalEntryIds);
  return {
    archive,
    carryBalances: choice.carryBalances,
    reversalEntryIndexes:
      reversalEntryIds == null
        ? null
        : archive.entries.flatMap((entry, index) =>
            typeof entry.id === "string" && reversalEntryIds.has(entry.id)
              ? [index]
              : [],
          ),
    carryFixedAssets: choice.carryFixedAssets,
  };
}

function byEndDateDescending(
  left: OpeningCarryoverSource,
  right: OpeningCarryoverSource,
): number {
  return right.fiscalPeriod.endDate.localeCompare(left.fiscalPeriod.endDate);
}

export function useOpeningCarryoverSources(
  target: FiscalPeriod | null,
): OpeningCarryoverSource[] {
  const {
    fiscalPeriods,
    applyCarryoverToFiscalPeriod,
    applyCarryoverFromArchiveToFiscalPeriod,
  } = useOpenkkAppState();
  const { loadFiscalPeriodEntries, journalTableMaster } = useOpenkkEntries();
  const readOtherBookPeriods = useOtherBookPeriodsReader();
  const [otherBookPeriods, setOtherBookPeriods] = useState<
    OpenkkOtherBookPeriod[]
  >([]);
  const targetId = target?.id ?? null;

  useEffect(() => {
    setOtherBookPeriods([]);
    if (targetId == null || readOtherBookPeriods == null) return;
    let cancelled = false;
    readOtherBookPeriods().then(
      (periods) => {
        if (!cancelled) setOtherBookPeriods(periods);
      },
      (error: unknown) => {
        console.error("[openkk] other books could not be read:", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [readOtherBookPeriods, targetId]);

  return useMemo(() => {
    if (target == null) return [];
    const sameBook = fiscalPeriods
      .filter((period) => isOpeningCarryoverSourceFor(target, period))
      .map((period): OpeningCarryoverSource => ({
        key: `period:${period.id}`,
        label: period.name,
        fiscalPeriod: period,
        loadEntries: () => loadFiscalPeriodEntries(period.id),
        apply: (targetPeriodId, choice) =>
          applyCarryoverToFiscalPeriod(targetPeriodId, {
            sourceFiscalPeriodId: period.id,
            ...choice,
          }),
      }));
    const otherBooks = otherBookPeriods
      .map((other) => ({
        other,
        period: mapRemoteFiscalPeriod(other.fiscalPeriod),
      }))
      .filter(({ period }) => isOpeningCarryoverSourceFor(target, period))
      .map(({ other, period }): OpeningCarryoverSource => ({
        key: `book:${other.bookName}:${period.id}`,
        label: `${period.name} (${other.bookName})`,
        fiscalPeriod: period,
        async loadEntries() {
          const { entries } = await other.readRecords();
          return entries
            .map((entry) =>
              storedEntryToRecord(entry, period.id, journalTableMaster),
            )
            .sort((left, right) => left.date.localeCompare(right.date));
        },
        async apply(targetPeriodId, choice) {
          const { entries, fixedAssets } = await other.readRecords();
          await applyCarryoverFromArchiveToFiscalPeriod(
            targetPeriodId,
            carryoverFromArchive(
              archivePayloadFromRecords(period, entries, fixedAssets),
              choice,
            ),
          );
        },
      }));
    return [...sameBook, ...otherBooks].sort(byEndDateDescending);
  }, [
    applyCarryoverFromArchiveToFiscalPeriod,
    applyCarryoverToFiscalPeriod,
    fiscalPeriods,
    journalTableMaster,
    loadFiscalPeriodEntries,
    otherBookPeriods,
    target,
  ]);
}
