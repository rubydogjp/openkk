import {
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertPositiveInteger,
  assertUnitRate,
  computeFixedAssetBookValue,
  getDefaultBookAccount,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

import type {
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodDbPatchInput,
  FiscalPeriodDbRecord,
  FiscalPeriodOpeningDbRecord,
  FixedAssetDbRecord,
} from "../persistence-types.js";
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
    throw serverValidationError("Archived import collections must be arrays");
  }
  if (input.entries.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Archived entries exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
    );
  }
  if (input.fixedAssets.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Archived fixed assets exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
    );
  }
  if (input.preClosings.length > 1 || input.closings.length > 1) {
    throw serverValidationError(
      "Archived closing collections must contain at most one record each",
    );
  }
  let totalLineCount = 0;
  for (const entry of input.entries) {
    if (typeof entry === "object" && entry != null && Array.isArray(entry.lines)) {
      totalLineCount = addArchiveLineCount(totalLineCount, entry.lines.length);
    }
  }
  for (const journal of input.fiscalPeriod.opening?.openingJournals ?? []) {
    if (
      typeof journal === "object" &&
      journal != null &&
      Array.isArray(journal.lines)
    ) {
      totalLineCount = addArchiveLineCount(
        totalLineCount,
        journal.lines.length,
      );
    }
  }
}

function addArchiveLineCount(total: number, count: number): number {
  const next = total + count;
  if (!Number.isSafeInteger(next) || next > MAX_ENTRY_IMPORT_LINES) {
    throw serverValidationError(
      `Archived journal lines exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
    );
  }
  return next;
}

export function assertDbOpeningForPeriod(
  opening: FiscalPeriodOpeningDbRecord,
  period: FiscalPeriodDbRecord,
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
  for (const journal of opening.openingJournals ?? []) {
    if (journal.date < period.startDate || journal.date > period.endDate) {
      throw serverValidationError(
        `Opening journal date ${journal.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
        "期首仕訳の日付を会計期間内にしてください",
      );
    }
  }
  if (!period.openingBalancesCompleted) return;

  for (const journal of opening.openingJournals ?? []) {
    if (journal.description.trim() === "") {
      throw serverValidationError(
        "Completed opening journal description is required",
        "期首仕訳の摘要を入力してください",
      );
    }
    assertEntryLinesBalanced(journal.lines, "Opening journal");
  }

  let assetTotal = 0;
  let liabilityAndEquityTotal = 0;
  for (const line of opening.openingBalanceLines ?? []) {
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
  period: FiscalPeriodDbRecord | null,
): void {
  if (period != null && period.userId !== userId) {
    throw serverNotFoundError(`fiscal period not found: ${period.id}`);
  }
}

export function assertDbEntryInput(
  input: EntryDbUpsertInput,
  period: FiscalPeriodDbRecord | null,
  label: string,
): void {
  if (typeof input.description !== "string" || input.description.trim() === "") {
    throw serverValidationError(`${label} description is required`);
  }
  assertIsoDate(input.date, `${label} date`);
  if (
    period != null &&
    (input.date < period.startDate || input.date > period.endDate)
  ) {
    throw serverValidationError(
      `${label} date ${input.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "仕訳日付を会計期間内にしてください",
    );
  }
  if (
    input.localId !== undefined &&
    (typeof input.localId !== "string" || input.localId.trim() === "")
  ) {
    throw serverValidationError(`${label} localId must be a non-blank string`);
  }
  assertUnitRate(input.businessRate, `${label} business rate`);
  if (!Array.isArray(input.lines)) {
    throw serverValidationError(`${label} lines must be an array`);
  }
  for (const line of input.lines) {
    if (line == null || typeof line !== "object") {
      throw serverValidationError(`${label} line must be an object`);
    }
    if (
      typeof line.bookAccountId !== "string" ||
      line.bookAccountId.trim() === ""
    ) {
      throw serverValidationError(`${label} line book account is required`);
    }
    if (getDefaultBookAccount(line.bookAccountId) == null) {
      throw serverValidationError(
        `${label} line references unknown book account: ${line.bookAccountId}`,
      );
    }
    if (
      typeof line.partnerName !== "string" ||
      typeof line.taxCategoryId !== "string" ||
      typeof line.businessCategoryId !== "string"
    ) {
      throw serverValidationError(`${label} line text fields are invalid`);
    }
  }
  assertEntryLinesBalanced(input.lines, label);
}

export function assertDbFixedAssetRecord(
  asset: FixedAssetDbRecord,
  period: FiscalPeriodDbRecord | null,
): void {
  if (typeof asset.name !== "string" || asset.name.trim() === "") {
    throw serverValidationError("Fixed asset name is required");
  }
  assertIsoDate(asset.acquisitionDate, "Fixed asset acquisition date");
  assertPositiveInteger(asset.acquisitionCost, "Fixed asset acquisition cost");
  assertPositiveInteger(asset.usefulLife, "Fixed asset useful life");
  if (asset.usefulLife > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS) {
    throw serverValidationError(
      `Fixed asset useful life must not exceed ${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS} years`,
    );
  }
  assertUnitRate(asset.businessRate, "Fixed asset business rate");
  if (asset.depreciationMethod !== "straight_line") {
    throw serverValidationError("Fixed asset depreciation method is invalid");
  }
  const account = getDefaultBookAccount(asset.bookAccountId);
  if (
    account == null ||
    account.accountType !== "asset" ||
    account.balanceSheetSection !== "fixed_asset"
  ) {
    throw serverValidationError(
      `Fixed asset book account must reference a fixed-asset account: ${asset.bookAccountId}`,
    );
  }
  if (period != null && asset.acquisitionDate > period.endDate) {
    throw serverValidationError(
      `Fixed asset acquisition date ${asset.acquisitionDate} must not be after fiscal period end ${period.endDate}`,
    );
  }
  const isDisposalStatus = asset.status === "sold" || asset.status === "disposed";
  if (isDisposalStatus && asset.disposalDate === "") {
    throw serverValidationError(
      `Fixed asset with status ${asset.status} requires a disposal date`,
    );
  }
  if (!isDisposalStatus && asset.disposalDate !== "") {
    throw serverValidationError(
      `Fixed asset with status ${asset.status} must not have a disposal date`,
    );
  }
  if (asset.disposalDate !== "") {
    assertIsoDate(asset.disposalDate, "Fixed asset disposal date");
    if (asset.disposalDate < asset.acquisitionDate) {
      throw serverValidationError(
        "Fixed asset disposal date must not be before acquisition date",
      );
    }
    if (
      period != null &&
      (asset.disposalDate < period.startDate ||
        asset.disposalDate > period.endDate)
    ) {
      throw serverValidationError(
        `Fixed asset disposal date ${asset.disposalDate} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      );
    }
  }
  assertNonNegativeSafeInteger(asset.disposalPrice, "Fixed asset disposal price");
  if (asset.status !== "sold" && asset.disposalPrice !== 0) {
    throw serverValidationError(
      `Fixed asset with status ${asset.status} must not have a disposal price`,
    );
  }
  if (
    asset.status === "retired" &&
    period != null &&
    computeFixedAssetBookValue({
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      usefulLife: asset.usefulLife,
      asOf: period.endDate,
    }) > 1
  ) {
    throw serverValidationError(
      "Fixed asset cannot be retired before it reaches memorandum value",
    );
  }
}

export function assertDbFiscalPeriodPatchAllowed(
  period: FiscalPeriodDbRecord,
  patch: FiscalPeriodDbPatchInput,
): void {
  if (period.archiveStatus === "archived") {
    throw serverConflictError(
      `archived fiscal period cannot be updated: ${period.id}`,
      "圧縮保存済みの会計期間は変更できません",
    );
  }
  const changedKeys = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (period.phase === "pre_closing") {
    throw serverConflictError(
      "fiscal period cannot be updated from phase pre_closing",
      "仮締め中の会計期間は変更できません",
    );
  }
  const allowedKeysByPhase: Record<
    FiscalPeriodDbRecord["phase"],
    ReadonlySet<string>
  > = {
    pre_opening: new Set([
      "name",
      "startDate",
      "endDate",
      "settingsCompleted",
      "openingBalancesCompleted",
      "opening",
    ]),
    journalizing: new Set(["openingBalancesCompleted", "opening"]),
    pre_closing: new Set(),
    post_closing: new Set(["documentsReceivedCompleted"]),
  };
  const disallowedKey = changedKeys.find(
    (key) => !allowedKeysByPhase[period.phase].has(key),
  );
  if (
    disallowedKey != null ||
    (period.phase === "post_closing" &&
      (changedKeys.length !== 1 || patch.documentsReceivedCompleted !== true))
  ) {
    throw serverConflictError(
      `fiscal period cannot update ${disallowedKey ?? "patch"} from phase ${period.phase}`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
}

export function assertDbStoredEntryRecord(
  record: EntryDbRecord,
  period: FiscalPeriodDbRecord,
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
    );
  }
  const { localId, ...storedInputWithoutLocalId } = record;
  assertDbEntryInput(
    localId === "" ? storedInputWithoutLocalId : record,
    period,
    "Stored entry",
  );
  const lineIds = new Set<string>();
  for (const line of record.lines) {
    if (
      typeof line.id !== "string" ||
      line.id.trim() === "" ||
      lineIds.has(line.id)
    ) {
      throw serverValidationError(
        `Stored entry line identity is invalid: ${record.id}`,
      );
    }
    lineIds.add(line.id);
  }
}

export function assertDbStoredFixedAssetRecord(
  asset: FixedAssetDbRecord,
  period: FiscalPeriodDbRecord,
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
    );
  }
  assertDbFixedAssetRecord(asset, period);
}

export function assertDbClosingGeneratedSizeLimits(
  entries: EntryDbUpsertInput[],
): void {
  if (!Array.isArray(entries)) {
    throw serverValidationError("Closing entries must be an array");
  }
  if (entries.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Closing entries exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
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
      );
    }
  }
}

export function assertDbClosingYear(
  period: FiscalPeriodDbRecord,
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
  period: FiscalPeriodDbRecord,
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
        throw serverValidationError(`${label} contains a duplicate year`);
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
    );
  }
}
