import {
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  MAX_ENTRY_LINES,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
} from "@rubydogjp/openkk-client-domain";
import type { OpenkkHttpEndpointKey } from "./types.js";

export function isValidSuccessBody(
  key: OpenkkHttpEndpointKey,
  body: unknown,
): boolean {
  switch (key) {
    case "authSignOut":
    case "entryRemove":
    case "fiscalPeriodRemove":
    case "fixedAssetRemove":
      return body === null;
    case "authStartSession":
      return isObject(body) && isSafeHttpUrl(body.authUrl);
    case "authCompleteSession":
      return isObject(body) && isNonBlankString(body.completionCode);
    case "authRedeemCompletionCode":
      return (
        isObject(body) &&
        isNonBlankString(body.userId) &&
        isNullableString(body.displayName) &&
        isNullableString(body.email) &&
        isNullableSafeHttpUrl(body.iconUrl) &&
        isNullableString(body.authProvider)
      );
    case "preClosingGet":
      return isObject(body) && typeof body.preClosed === "boolean";
    case "closingGet":
      return isObject(body) && typeof body.closed === "boolean";
    case "preClosingRun":
    case "preClosingCancel":
    case "closingRun":
    case "fiscalPeriodCreate":
    case "fiscalPeriodNextCreate":
    case "fiscalPeriodImportArchived":
    case "fiscalPeriodPatch":
    case "fiscalPeriodStart":
    case "fiscalPeriodArchive":
    case "fiscalPeriodPurgeArchivedData":
      return isObject(body) && isFiscalPeriod(body.fiscalPeriod);
    case "entriesGetAll":
      return isObject(body) && isEntryRecordArray(body.entries);
    case "entryCreate":
    case "entryPatch":
      return isObject(body) && isEntry(body.entry);
    case "entryImportMany":
      return (
        isObject(body) &&
        isNonNegativeInteger(body.importedCount) &&
        isEntryRecordArray(body.entries) &&
        body.importedCount === body.entries.length
      );
    case "fiscalPeriodsGetAll":
      return (
        isObject(body) &&
        isUniqueRecordArray(body.fiscalPeriods, isFiscalPeriod)
      );
    case "fixedAssetsGetAll":
      return (
        isObject(body) && isUniqueRecordArray(body.fixedAssets, isFixedAsset)
      );
    case "fixedAssetCreate":
    case "fixedAssetPatch":
      return isObject(body) && isFixedAsset(body.fixedAsset);
    case "masterBookAccounts":
      return (
        isObject(body) &&
        isUniqueRecordArray(body.bookAccounts, isBookAccount)
      );
    case "masterTaxCategories":
      return (
        isObject(body) &&
        isUniqueRecordArray(body.taxCategories, isTaxCategory)
      );
    case "masterBusinessCategories":
      return (
        isObject(body) &&
        isUniqueRecordArray(body.businessCategories, isBusinessCategory)
      );
    case "maintenanceGet":
      return (
        isObject(body) &&
        typeof body.enabled === "boolean" &&
        isString(body.title) &&
        isString(body.message) &&
        (body.updatedAt === null || isIsoTimestamp(body.updatedAt))
      );
  }
}

function isFiscalPeriod(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (
    !(
      hasNonBlankStrings(value, ["id", "userId", "name"]) &&
      hasStrings(value, [
        "startDate",
        "endDate",
        "createdAt",
        "updatedAt",
      ]) &&
      isIsoDateString(value.startDate) &&
      isIsoDateString(value.endDate) &&
      isIsoTimestamp(value.createdAt) &&
      isIsoTimestamp(value.updatedAt) &&
      ["pre_opening", "journalizing", "pre_closing", "post_closing"].includes(
        String(value.phase),
      ) &&
      ["active", "archived", "purged"].includes(String(value.archiveStatus)) &&
      isNullableIsoTimestamp(value.archivedAt) &&
      typeof value.openingBalancesCompleted === "boolean" &&
      typeof value.documentsReceivedCompleted === "boolean"
    )
  ) {
    return false;
  }
  return isOpening(value.opening);
}

function isOpening(value: unknown): boolean {
  if (!isObject(value)) return false;
  const balanceLines = value.openingBalanceLines;
  const journals = value.openingJournals;
  if (
    !Array.isArray(balanceLines) ||
    !Array.isArray(journals) ||
    balanceLines.length > MAX_ENTRY_IMPORT_ITEMS ||
    journals.length > MAX_ENTRY_IMPORT_ITEMS
  ) {
    return false;
  }
  let totalJournalLines = 0;
  for (const journal of journals) {
    if (!isObject(journal) || !Array.isArray(journal.lines)) continue;
    totalJournalLines += journal.lines.length;
    if (
      !Number.isSafeInteger(totalJournalLines) ||
      totalJournalLines > MAX_ENTRY_IMPORT_LINES
    ) {
      return false;
    }
  }
  if (
    !isArrayOf(balanceLines, isOpeningBalanceLine) ||
    !isArrayOf(journals, isOpeningJournal)
  ) {
    return false;
  }
  return (
    hasUniqueValues(balanceLines.map((line) => line.id)) &&
    hasUniqueValues(balanceLines.map((line) => line.accountId)) &&
    hasUniqueValues(journals.map((journal) => journal.id))
  );
}

function isOpeningBalanceLine(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "accountId"]) &&
    isOpeningBalanceAccountId(value.accountId) &&
    isNonNegativeSafeInteger(value.amount)
  );
}

function isOpeningBalanceAccountId(value: unknown): value is string {
  if (!isString(value)) return false;
  const hasValidPrefix = value.startsWith("a:") || value.startsWith("l:");
  const accountName = value.slice(2);
  return (
    hasValidPrefix &&
    accountName.trim() !== "" &&
    accountName === accountName.trim()
  );
}

function isOpeningJournal(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "date"]) &&
    isString(value.description) &&
    isIsoDateString(value.date) &&
    isUnitRate(value.businessRate) &&
    isArrayOf(value.lines, isEntryLine) &&
    value.lines.length <= MAX_ENTRY_LINES &&
    hasUniqueValues(value.lines.map((line) => line.id))
  );
}

function isEntry(value: unknown): boolean {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, [
      "id",
      "userId",
      "fiscalPeriodId",
      "date",
      "description",
      "createdAt",
      "updatedAt",
    ]) &&
    isNullableString(value.localId) &&
    (value.localId === null || value.localId.trim() !== "") &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    isIsoDateString(value.date) &&
    isUnitRate(value.businessRate) &&
    isArrayOf(value.lines, isEntryLine) &&
    value.lines.length <= MAX_ENTRY_LINES &&
    hasUniqueValues(value.lines.map((line) => line.id))
  );
}

function isEntryLine(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "bookAccountId"]) &&
    hasStrings(value, [
      "partnerName",
      "taxCategoryId",
      "businessCategoryId",
    ]) &&
    (value.side === "debit" || value.side === "credit") &&
    isNonNegativeSafeInteger(value.amount)
  );
}

function isFixedAsset(value: unknown): boolean {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, [
      "id",
      "userId",
      "fiscalPeriodId",
      "name",
      "acquisitionDate",
      "bookAccountId",
      "createdAt",
      "updatedAt",
    ]) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    isIsoDateString(value.acquisitionDate) &&
    isNullableIsoDateString(value.disposalDate) &&
    isPositiveInteger(value.acquisitionCost) &&
    isPositiveInteger(value.usefulLife) &&
    value.usefulLife <= MAX_FIXED_ASSET_USEFUL_LIFE_YEARS &&
    value.depreciationMethod === "straight_line" &&
    isUnitRate(value.businessRate) &&
    ["active", "sold", "disposed", "retired"].includes(String(value.status)) &&
    (value.disposalPrice === null ||
      isNonNegativeSafeInteger(value.disposalPrice))
  );
}

function isBookAccount(value: unknown): boolean {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "name"]) &&
    hasStrings(value, [
      "description",
      "kana",
      "createdAt",
      "updatedAt",
    ]) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    (value.normalBalanceSide === "debit" ||
      value.normalBalanceSide === "credit") &&
    [
      "asset",
      "liability",
      "equity",
      "revenue",
      "cost_of_sales",
      "expense",
    ].includes(String(value.accountType)) &&
    [
      "current_asset",
      "fixed_asset",
      "deferred_asset",
      "current_liability",
      "long_term_liability",
      "equity",
      "none",
    ].includes(String(value.balanceSheetSection)) &&
    Number.isSafeInteger(value.sortOrder)
  );
}

function isTaxCategory(value: unknown): boolean {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "name"]) &&
    hasStrings(value, ["createdAt", "updatedAt"]) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    isBasisPointRate(value.rate)
  );
}

function isBusinessCategory(value: unknown): boolean {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "name"]) &&
    hasStrings(value, ["createdAt", "updatedAt"]) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => isString(value[key]));
}

function hasNonBlankStrings(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every((key) => isNonBlankString(value[key]));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonBlankString(value: unknown): value is string {
  return isString(value) && value.trim() !== "";
}

function isSafeHttpUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableSafeHttpUrl(value: unknown): boolean {
  return value === null || isSafeHttpUrl(value);
}

function isNullableIsoDateString(value: unknown): boolean {
  return value === null || isIsoDateString(value);
}

function isNullableIsoTimestamp(value: unknown): boolean {
  return value === null || isIsoTimestamp(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isUnitRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isBasisPointRate(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= 10_000
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}



function hasUniqueValues(values: unknown[]): boolean {
  return new Set(values).size === values.length;
}

function isUniqueRecordArray(
  value: unknown,
  predicate: (item: unknown) => boolean,
): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.every((item) => predicate(item) && isObject(item)) &&
    hasUniqueValues(value.map((item) => item.id))
  );
}

function isEntryRecordArray(
  value: unknown,
): value is Array<Record<string, unknown>> {
  return (
    isUniqueRecordArray(value, isEntry) &&
    hasUniqueValues(
      value
        .map((entry) => entry.localId)
        .filter((localId) => localId !== null),
    )
  );
}


function isIsoTimestamp(value: unknown): value is string {
  if (!isString(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isIsoDateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[];
function isArrayOf(
  value: unknown,
  predicate: (item: unknown) => boolean,
): boolean;
function isArrayOf(
  value: unknown,
  predicate: (item: unknown) => boolean,
): boolean {
  return Array.isArray(value) && value.every(predicate);
}
