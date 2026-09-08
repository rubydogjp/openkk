import {
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  MAX_JOURNAL_ENTRY_LINES,
  MAX_JOURNAL_IMPORT_ENTRIES,
  MAX_JOURNAL_IMPORT_LINES,
} from "@rubydogjp/openkk-client-domain";
import type { OpenkkHttpEndpointKey } from "./types.js";

const MAX_ENTRY_LINES = MAX_JOURNAL_ENTRY_LINES;
const MAX_IMPORT_ITEMS = MAX_JOURNAL_IMPORT_ENTRIES;
const MAX_IMPORT_LINES = MAX_JOURNAL_IMPORT_LINES;

export function isValidSuccessBody(
  key: OpenkkHttpEndpointKey,
  body: unknown,
): boolean {
  switch (key) {
    case "authSignOut":
    case "entryRemove":
    case "fiscalPeriodRemove":
    case "fixedAssetRemove":
      return body == null;
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
      return (
        isObject(body) &&
        (body.preClosing === null || isEmptyObject(body.preClosing))
      );
    case "closingGet":
      return (
        isObject(body) &&
        (body.closing === null || isEmptyObject(body.closing))
      );
    case "preClosingRun":
    case "preClosingCancel":
    case "closingRun":
    case "fiscalPeriodCreate":
    case "fiscalPeriodImportArchived":
    case "fiscalPeriodPatch":
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
        isUniqueRecordArray(body.fiscalPeriods, isFiscalPeriod) &&
        hasNoOverlappingActiveFiscalPeriods(body.fiscalPeriods)
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
      value.startDate <= value.endDate &&
      ["pre_opening", "journalizing", "pre_closing", "post_closing"].includes(
        String(value.phase),
      ) &&
      ["active", "archived"].includes(String(value.archiveStatus)) &&
      isNullableBoolean(value.archiveDataAvailable) &&
      isNullableIsoTimestamp(value.archivedAt) &&
      typeof value.settingsCompleted === "boolean" &&
      typeof value.openingBalancesCompleted === "boolean" &&
      typeof value.documentsReceivedCompleted === "boolean"
    )
  ) {
    return false;
  }
  if (
    (value.phase === "pre_opening"
      ? value.settingsCompleted
      : !value.settingsCompleted) ||
    ((value.phase === "pre_closing" || value.phase === "post_closing") &&
      !value.openingBalancesCompleted) ||
    (value.documentsReceivedCompleted && value.phase !== "post_closing") ||
    (value.archiveDataAvailable === false &&
      value.archiveStatus !== "archived") ||
    (value.archiveStatus === "active" && value.archivedAt != null)
  ) {
    return false;
  }
  if (value.opening == null) return !value.openingBalancesCompleted;
  if (!isOpening(value.opening, value)) return false;
  return (
    !value.openingBalancesCompleted ||
    areOpeningBalanceLinesBalanced(value.opening.openingBalanceLines ?? [])
  );
}

type ValidOpening = Record<string, unknown> & {
  openingBalanceLines: Array<Record<string, unknown>> | null;
  openingJournals: Array<Record<string, unknown>> | null;
};

function isOpening(
  value: unknown,
  fiscalPeriod: Record<string, unknown>,
): value is ValidOpening {
  if (!isObject(value)) return false;
  if (
    !hasNonBlankStrings(value, ["id", "userId", "fiscalPeriodId"]) ||
    !hasStrings(value, ["createdAt", "updatedAt"]) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    value.userId !== fiscalPeriod.userId ||
    value.fiscalPeriodId !== fiscalPeriod.id
  ) {
    return false;
  }
  const balanceLines = value.openingBalanceLines ?? [];
  const journals = value.openingJournals ?? [];
  if (
    !Array.isArray(balanceLines) ||
    !Array.isArray(journals) ||
    balanceLines.length > MAX_IMPORT_ITEMS ||
    journals.length > MAX_IMPORT_ITEMS
  ) {
    return false;
  }
  let totalJournalLines = 0;
  for (const journal of journals) {
    if (!isObject(journal) || !Array.isArray(journal.lines)) continue;
    totalJournalLines += journal.lines.length;
    if (
      !Number.isSafeInteger(totalJournalLines) ||
      totalJournalLines > MAX_IMPORT_LINES
    ) {
      return false;
    }
  }
  if (
    !isArrayOf(balanceLines, isOpeningBalanceLine) ||
    !isArrayOf(journals, (journal) =>
      isOpeningJournal(
        journal,
        String(fiscalPeriod.startDate),
        String(fiscalPeriod.endDate),
        fiscalPeriod.openingBalancesCompleted !== true,
      ),
    )
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

function isOpeningJournal(
  value: unknown,
  periodStartDate: string,
  periodEndDate: string,
  allowZero: boolean,
): value is Record<string, unknown> {
  return (
    isObject(value) &&
    hasNonBlankStrings(value, ["id", "date"]) &&
    isString(value.description) &&
    (allowZero || value.description.trim() !== "") &&
    isIsoDateString(value.date) &&
    value.date >= periodStartDate &&
    value.date <= periodEndDate &&
    isUnitRate(value.businessRate) &&
    isArrayOf(value.lines, isEntryLine) &&
    value.lines.length <= MAX_ENTRY_LINES &&
    areEntryLinesBalanced(value.lines, allowZero) &&
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
    isString(value.localId) &&
    (value.localId === "" || value.localId.trim() !== "") &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    isIsoDateString(value.date) &&
    isUnitRate(value.businessRate) &&
    isArrayOf(value.lines, isEntryLine) &&
    value.lines.length <= MAX_ENTRY_LINES &&
    areEntryLinesBalanced(value.lines) &&
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
  if (
    !isObject(value) ||
    !hasNonBlankStrings(value, [
      "id",
      "userId",
      "fiscalPeriodId",
      "name",
      "acquisitionDate",
      "bookAccountId",
      "createdAt",
      "updatedAt",
    ]) ||
    !isString(value.disposalDate) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    !isIsoDateString(value.acquisitionDate) ||
    (value.disposalDate !== "" && !isIsoDateString(value.disposalDate)) ||
    !isPositiveInteger(value.acquisitionCost) ||
    !isPositiveInteger(value.usefulLife) ||
    value.usefulLife > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS ||
    value.depreciationMethod !== "straight_line" ||
    !isUnitRate(value.businessRate) ||
    !["active", "sold", "disposed", "retired"].includes(
      String(value.status),
    ) ||
    !isNonNegativeSafeInteger(value.disposalPrice)
  ) {
    return false;
  }
  const hasDisposal = value.status === "sold" || value.status === "disposed";
  return (
    (hasDisposal ? value.disposalDate !== "" : value.disposalDate === "") &&
    (value.status === "sold" ? true : value.disposalPrice === 0) &&
    (value.disposalDate === "" || value.disposalDate >= value.acquisitionDate)
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

function isEmptyObject(value: unknown): boolean {
  return isObject(value) && Object.keys(value).length === 0;
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

function isNullableString(value: unknown): boolean {
  return value == null || isString(value);
}

function isNullableSafeHttpUrl(value: unknown): boolean {
  return value == null || isSafeHttpUrl(value);
}

function isNullableIsoTimestamp(value: unknown): boolean {
  return value == null || isIsoTimestamp(value);
}

function isNullableBoolean(value: unknown): boolean {
  return value == null || typeof value === "boolean";
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

function areEntryLinesBalanced(
  lines: Array<Record<string, unknown>>,
  allowZero = false,
): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  let hasDebit = false;
  let hasCredit = false;
  for (const line of lines) {
    const amount = line.amount;
    if (!isNonNegativeSafeInteger(amount)) return false;
    if (line.side === "debit") {
      hasDebit = true;
      debitTotal += amount;
    } else if (line.side === "credit") {
      hasCredit = true;
      creditTotal += amount;
    } else return false;
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      return false;
    }
  }
  return (
    hasDebit &&
    hasCredit &&
    (allowZero || debitTotal > 0) &&
    debitTotal === creditTotal
  );
}

function areOpeningBalanceLinesBalanced(
  lines: Array<Record<string, unknown>>,
): boolean {
  let assetTotal = 0;
  let liabilityAndEquityTotal = 0;
  for (const line of lines) {
    const amount = line.amount;
    const accountId = line.accountId;
    if (!isNonNegativeSafeInteger(amount) || !isString(accountId)) {
      return false;
    }
    if (accountId.startsWith("a:")) assetTotal += amount;
    else if (accountId.startsWith("l:")) liabilityAndEquityTotal += amount;
    else return false;
    if (
      !Number.isSafeInteger(assetTotal) ||
      !Number.isSafeInteger(liabilityAndEquityTotal)
    ) {
      return false;
    }
  }
  return assetTotal === liabilityAndEquityTotal;
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
        .filter((localId) => localId !== ""),
    )
  );
}

function hasNoOverlappingActiveFiscalPeriods(
  periods: Array<Record<string, unknown>>,
): boolean {
  const active = periods
    .filter((period) => period.archiveStatus === "active")
    .sort((left, right) =>
      String(left.startDate).localeCompare(String(right.startDate)),
    );
  return active.every(
    (period, index) =>
      index === 0 ||
      String(period.startDate) > String(active[index - 1]!.endDate),
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
