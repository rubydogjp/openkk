import {
  assertCompletedOpening,
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertEntryMatchesRules,
  assertFiscalPeriodArchiveSize,
  assertFiscalPeriodClosingMarkers,
  assertFiscalPeriodPatchMatchesPhase,
  assertFixedAssetMatchesRules,
  assertPositiveInteger,
  assertUniqueIds,
  isNonBlankString,
  requireObject,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

import type {
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodDbPatchInput,
  FiscalPeriodOpeningDbRecord,
  FixedAssetDbRecord,
} from "@rubydogjp/openkk-server-ports";
import type {
  FiscalPeriodDbData,
  OwnedFiscalPeriodDbData,
} from "./table-types.js";
import { validateOpeningDbRecord } from "./persistence-codec.js";

export function assertDbArchiveImportSizeLimits(
  input: unknown,
): asserts input is FiscalPeriodArchiveDbImportInput {
  const value = requireObject(input, "Archived import");
  if (
    !Array.isArray(value.entries) ||
    !Array.isArray(value.fixedAssets) ||
    !Array.isArray(value.preClosings) ||
    !Array.isArray(value.closings)
  ) {
    throw serverValidationError(
      "Archived import collections must be arrays",
      null,
    );
  }
  assertFiscalPeriodArchiveSize([
    value.fiscalPeriod,
    value.entries,
    value.fixedAssets,
    value.preClosings,
    value.closings,
  ]);
  if (value.preClosings.length > 1 || value.closings.length > 1) {
    throw serverValidationError(
      "Archived closing collections must contain at most one record each",
      null,
    );
  }
}

export function assertDbOpeningForPeriod(
  opening: FiscalPeriodOpeningDbRecord,
  period: OwnedFiscalPeriodDbData,
): void {
  validateOpeningDbRecord(opening);
  if (
    opening.userId !== period.userId ||
    opening.fiscalPeriodId !== period.id
  ) {
    throw serverValidationError(
      "Opening ownership must match the fiscal period",
      "期首データの会計期間情報が一致しません",
    );
  }
  for (const journal of opening.openingJournals) {
    if (journal.date < period.startDate || journal.date > period.endDate) {
      throw serverValidationError(
        `Opening journal date ${journal.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
        "期首仕訳の日付を会計期間内にしてください",
      );
    }
  }
  if (!period.openingBalancesCompleted) return;
  assertCompletedOpening(opening, "Opening");
}

export function assertDbPeriodOwnership(
  userId: string,
  period: OwnedFiscalPeriodDbData | null,
): void {
  if (period != null && period.userId !== userId) {
    throw serverNotFoundError(`fiscal period not found: ${period.id}`);
  }
}

export function assertDbFiscalPeriodPatchAllowed(
  period: FiscalPeriodDbData,
  patch: FiscalPeriodDbPatchInput,
): void {
  if (period.archiveStatus === "archived") {
    throw serverConflictError(
      `archived fiscal period cannot be updated: ${period.id}`,
      "圧縮保存済みの会計期間は変更できません",
    );
  }
  assertFiscalPeriodPatchMatchesPhase(period, patch);
}

export function assertDbStoredEntryRecord(
  record: unknown,
  period: OwnedFiscalPeriodDbData,
): asserts record is EntryDbRecord {
  const value = requireObject(record, "Stored entry");
  const id = value.id;
  if (
    !isNonBlankString(id) ||
    !isNonBlankString(value.userId) ||
    !isNonBlankString(value.fiscalPeriodId) ||
    value.userId !== period.userId ||
    value.fiscalPeriodId !== period.id
  ) {
    throw serverValidationError(
      `Stored entry identity is invalid: ${String(id)}`,
      null,
    );
  }
  assertEntryMatchesRules(value, period, "Stored entry");
  assertUniqueIds(value.lines, `Stored entry ${id} line`, null);
}

export function assertDbStoredFixedAssetRecord(
  asset: unknown,
  period: OwnedFiscalPeriodDbData,
): asserts asset is FixedAssetDbRecord {
  const value = requireObject(asset, "Stored fixed asset");
  if (
    !isNonBlankString(value.id) ||
    !isNonBlankString(value.userId) ||
    !isNonBlankString(value.fiscalPeriodId) ||
    value.userId !== period.userId ||
    value.fiscalPeriodId !== period.id
  ) {
    throw serverValidationError(
      `Stored fixed asset identity is invalid: ${String(value.id)}`,
      null,
    );
  }
  assertFixedAssetMatchesRules(value, period);
}

export function assertDbClosingGeneratedSizeLimits(
  entries: unknown,
): asserts entries is EntryDbUpsertInput[] {
  if (!Array.isArray(entries)) {
    throw serverValidationError("Closing entries must be an array", null);
  }
  assertEntryCollectionItemLimit(entries, "Closing entries", null);
  assertEntryCollectionLineLimit(entries, "Closing entries", null);
}

export function assertDbClosingYear(
  period: FiscalPeriodDbData,
  year: number,
): void {
  assertPositiveInteger(year, "Closing year");
  const expectedYear = Number(period.endDate.slice(0, 4));
  if (year !== expectedYear) {
    throw serverValidationError(
      `Closing year ${year} must match fiscal period end year ${expectedYear}`,
      "締め年度が会計期間の終了年と一致しません",
    );
  }
}

export function assertDbImportedClosingState(
  period: FiscalPeriodDbData,
  preClosings: ReadonlyArray<{ year: number }>,
  closings: ReadonlyArray<{ year: number }>,
): void {
  for (const row of [...preClosings, ...closings]) {
    assertDbClosingYear(period, row.year);
  }
  assertFiscalPeriodClosingMarkers(
    period.phase,
    {
      hasPreClosing: preClosings.length > 0,
      hasClosing: closings.length > 0,
    },
    "Imported",
  );
}
