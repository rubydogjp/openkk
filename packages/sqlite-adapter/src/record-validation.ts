import {
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertEntryMatchesRules,
  assertFiscalPeriodArchiveSize,
  assertFiscalPeriodPatchMatchesPhase,
  assertFixedAssetMatchesRules,
  assertOpeningMatchesRules,
  assertUniqueIds,
  isNonBlankString,
  requireObject,
  serverConflictError,
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
import type { FiscalPeriodDbData } from "./table-types.js";

export function assertDbArchiveImportSizeLimits(
  input: unknown,
): asserts input is FiscalPeriodArchiveDbImportInput {
  const value = requireObject(input, "Archived import");
  if (!Array.isArray(value.entries) || !Array.isArray(value.fixedAssets)) {
    throw serverValidationError(
      "Archived import collections must be arrays",
      null,
    );
  }
  assertFiscalPeriodArchiveSize([
    value.fiscalPeriod,
    value.entries,
    value.fixedAssets,
  ]);
}

export function assertDbOpeningForPeriod(
  opening: FiscalPeriodOpeningDbRecord,
  period: FiscalPeriodDbData,
): void {
  assertOpeningMatchesRules(opening, period, "Opening", {
    completed: period.openingBalancesCompleted,
  });
}

export function assertDbFiscalPeriodPatchAllowed(
  period: FiscalPeriodDbData,
  patch: FiscalPeriodDbPatchInput,
): void {
  if (period.archiveStatus !== "active") {
    throw serverConflictError(
      `archived fiscal period cannot be updated: ${period.id}`,
      "圧縮保存済みの会計期間は変更できません",
    );
  }
  assertFiscalPeriodPatchMatchesPhase(period, patch);
}

export function assertDbStoredEntryRecord(
  record: unknown,
  period: FiscalPeriodDbData,
): asserts record is EntryDbRecord {
  const value = requireObject(record, "Stored entry");
  const id = value.id;
  if (
    !isNonBlankString(id) ||
    !isNonBlankString(value.userId) ||
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
  period: FiscalPeriodDbData,
): asserts asset is FixedAssetDbRecord {
  const value = requireObject(asset, "Stored fixed asset");
  if (
    !isNonBlankString(value.id) ||
    !isNonBlankString(value.userId) ||
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
