import {
  assertEntryLinesBalanced,
  assertEntryMatchesRules,
  assertFiscalPeriodArchiveSize,
  assertFiscalPeriodPatchMatchesPhase,
  assertFixedAssetMatchesRules,
  assertPositiveInteger,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
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
  FiscalPeriodDbRow,
} from "./table-types.js";
import { validateOpeningDbRecord } from "./persistence-codec.js";

export function assertDbArchiveImportSizeLimits(
  input: FiscalPeriodArchiveDbImportInput,
): void {
  if (
    !Array.isArray(input.entries) ||
    !Array.isArray(input.fixedAssets) ||
    !Array.isArray(input.preClosings) ||
    !Array.isArray(input.closings)
  ) {
    throw serverValidationError("Archived import collections must be arrays", null);
  }
  assertFiscalPeriodArchiveSize([
    input.fiscalPeriod, input.entries, input.fixedAssets, input.preClosings, input.closings,
  ]);
  if (input.preClosings.length > 1 || input.closings.length > 1) {
    throw serverValidationError(
      "Archived closing collections must contain at most one record each",
      null,
    );
  }
}

export function assertDbOpeningForPeriod(
  opening: FiscalPeriodOpeningDbRecord,
  period: FiscalPeriodDbRow,
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

  for (const journal of opening.openingJournals) {
    if (journal.description.trim() === "") {
      throw serverValidationError(
        "Completed opening journal description is required",
        "期首仕訳の摘要を入力してください",
      );
    }
    assertEntryLinesBalanced(journal.lines, "Opening journal", {
      allowZero: false,
    });
  }

  let assetTotal = 0;
  let liabilityAndEquityTotal = 0;
  for (const line of opening.openingBalanceLines) {
    if (line.accountId.startsWith("a:")) {
      assetTotal += line.amount;
    } else {
      liabilityAndEquityTotal += line.amount;
    }
    if (
      !Number.isSafeInteger(assetTotal) ||
      !Number.isSafeInteger(liabilityAndEquityTotal)
    ) {
      throw serverValidationError(
        "Opening balance totals exceed the safe integer range",
        "期首残高の合計金額が大きすぎます",
      );
    }
  }
  if (assetTotal !== liabilityAndEquityTotal) {
    throw serverValidationError(
      `Opening balances must balance: assets ${assetTotal}, liabilities and equity ${liabilityAndEquityTotal}`,
      "期首残高の資産合計と負債・元入金合計を一致させてください",
    );
  }
}

export function assertDbPeriodOwnership(
  userId: string,
  period: FiscalPeriodDbRow | null,
): void {
  if (period != null && period.userId !== userId) {
    throw serverNotFoundError(`fiscal period not found: ${period.id}`);
  }
}

export function assertDbEntryInput(
  input: EntryDbUpsertInput,
  period: FiscalPeriodDbData | null,
  label: string,
): void {
  assertEntryMatchesRules(input, period, label);
}

export function assertDbFixedAssetRecord(
  asset: FixedAssetDbRecord,
  period: FiscalPeriodDbData | null,
): void {
  assertFixedAssetMatchesRules(asset, period);
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
  record: EntryDbRecord,
  period: FiscalPeriodDbRow,
): void {
  if (
    typeof record.id !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.fiscalPeriodId !== "string" ||
    record.id.trim() === "" ||
    record.userId.trim() === "" ||
    record.fiscalPeriodId.trim() === "" ||
    record.userId !== period.userId ||
    record.fiscalPeriodId !== period.id
  ) {
    throw serverValidationError(
      `Stored entry identity is invalid: ${String(record.id)}`,
      null,
    );
  }
  assertDbEntryInput(record, period, "Stored entry");
  const lineIds = new Set<string>();
  for (const line of record.lines) {
    if (
      typeof line.id !== "string" ||
      line.id.trim() === "" ||
      lineIds.has(line.id)
    ) {
      throw serverValidationError(
        `Stored entry line identity is invalid: ${record.id}`,
        null,
      );
    }
    lineIds.add(line.id);
  }
}

export function assertDbStoredFixedAssetRecord(
  asset: FixedAssetDbRecord,
  period: FiscalPeriodDbRow,
): void {
  if (
    typeof asset.id !== "string" ||
    typeof asset.userId !== "string" ||
    typeof asset.fiscalPeriodId !== "string" ||
    asset.id.trim() === "" ||
    asset.userId.trim() === "" ||
    asset.fiscalPeriodId.trim() === "" ||
    asset.userId !== period.userId ||
    asset.fiscalPeriodId !== period.id
  ) {
    throw serverValidationError(
      `Stored fixed asset identity is invalid: ${String(asset.id)}`,
      null,
    );
  }
  assertDbFixedAssetRecord(asset, period);
}

export function assertDbClosingGeneratedSizeLimits(
  entries: EntryDbUpsertInput[],
): void {
  if (!Array.isArray(entries)) {
    throw serverValidationError("Closing entries must be an array", null);
  }
  if (entries.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Closing entries exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      null,
    );
  }
  let totalLineCount = 0;
  for (const entry of entries) {
    if (entry == null || !Array.isArray(entry.lines)) continue;
    totalLineCount += entry.lines.length;
    if (
      !Number.isSafeInteger(totalLineCount) ||
      totalLineCount > MAX_ENTRY_IMPORT_LINES
    ) {
      throw serverValidationError(
        `Closing entries exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
        null,
      );
    }
  }
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
  const validateRows = (
    rows: ReadonlyArray<{ year: number }>,
    label: string,
  ) => {
    const years = new Set<number>();
    for (const row of rows) {
      assertDbClosingYear(period, row.year);
      if (years.has(row.year)) {
        throw serverValidationError(`${label} contains a duplicate year`, null);
      }
      years.add(row.year);
    }
  };
  validateRows(preClosings, "Imported pre-closing records");
  validateRows(closings, "Imported closing records");

  const hasPreClosing = preClosings.length === 1;
  const hasClosing = closings.length === 1;
  const isConsistent =
    period.phase === "pre_closing"
      ? hasPreClosing && !hasClosing
      : period.phase === "post_closing"
        ? hasPreClosing && hasClosing
        : !hasPreClosing && !hasClosing;
  if (!isConsistent) {
    throw serverValidationError(
      `Imported closing records are inconsistent with phase ${period.phase}`,
      null,
    );
  }
}
