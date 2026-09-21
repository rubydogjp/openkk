import {
  assertDateRange,
  assertEntryLinesBalanced,
  assertOpeningBalanceAccountId,
  assertUniqueAccountIds,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  parseIsoDate,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryDbLine,
  FiscalPeriodOpeningDbRecord,
} from "@rubydogjp/openkk-server-ports";
import type {
  FiscalPeriodDbData,
  FixedAssetDbData,
} from "./table-types.js";

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

export function parseFiscalPeriodDbData(
  json: string,
): FiscalPeriodDbData {
  return decodeRecord(json, "fiscal period", (value) => {
    const id = nonBlankString(value, "id");
    const name = nonBlankString(value, "name");
    const startDate = isoDate(value, "startDate");
    const endDate = isoDate(value, "endDate");
    const phase = enumValue(value, "phase", [
      "pre_opening",
      "journalizing",
      "pre_closing",
      "post_closing",
    ]);
    const archiveStatus = enumValue(value, "archiveStatus", [
      "active",
      "archived",
    ]);
    const settingsCompleted = booleanValue(value, "settingsCompleted");
    const openingBalancesCompleted = booleanValue(
      value,
      "openingBalancesCompleted",
    );
    const documentsReceivedCompleted = booleanValue(
      value,
      "documentsReceivedCompleted",
    );
    const archiveDataAvailable = booleanValue(
      value,
      "archiveDataAvailable",
    );
    const archivedAt = nullableIsoTimestamp(value, "archivedAt");
    assertDateRange(startDate, endDate, "fiscal period");
    validateFiscalPeriodLifecycle(value);
    return {
      id,
      name,
      startDate,
      endDate,
      phase,
      archiveStatus,
      archiveDataAvailable,
      archivedAt,
      settingsCompleted,
      openingBalancesCompleted,
      documentsReceivedCompleted,
    };
  });
}

export function serializeFiscalPeriodDbData(
  value: FiscalPeriodDbData,
): string {
  const data: FiscalPeriodDbData = {
    id: value.id,
    name: value.name,
    startDate: value.startDate,
    endDate: value.endDate,
    phase: value.phase,
    archiveStatus: value.archiveStatus,
    archiveDataAvailable: value.archiveDataAvailable,
    archivedAt: value.archivedAt,
    settingsCompleted: value.settingsCompleted,
    openingBalancesCompleted: value.openingBalancesCompleted,
    documentsReceivedCompleted: value.documentsReceivedCompleted,
  };
  return serializeRecord(data, parseFiscalPeriodDbData);
}

export function validateOpeningDbRecord(
  opening: FiscalPeriodOpeningDbRecord,
): void {
  validateOpening(asObject(opening, "opening"));
}

export function parseFixedAssetDbData(json: string): FixedAssetDbData {
  return decodeRecord(json, "fixed asset", (value) => {
    const id = nonBlankString(value, "id");
    const fiscalPeriodId = nonBlankString(value, "fiscalPeriodId");
    const name = nonBlankString(value, "name");
    const acquisitionDate = isoDate(value, "acquisitionDate");
    const acquisitionCost = positiveInteger(value, "acquisitionCost");
    const usefulLife = positiveInteger(value, "usefulLife");
    const depreciationMethod = enumValue(value, "depreciationMethod", [
      "straight_line",
    ]);
    const businessRate = unitRate(value, "businessRate");
    const status = enumValue(value, "status", [
      "active",
      "sold",
      "disposed",
      "retired",
    ]);
    const disposalDate = nullableIsoDate(value, "disposalDate");
    const disposalPrice = nullableNonNegativeInteger(
      value,
      "disposalPrice",
    );
    const bookAccountId = nonBlankString(value, "bookAccountId");
    return {
      id,
      fiscalPeriodId,
      name,
      acquisitionDate,
      acquisitionCost,
      usefulLife,
      depreciationMethod,
      businessRate,
      status,
      disposalDate,
      disposalPrice,
      bookAccountId,
    };
  });
}

export function serializeFixedAssetDbData(
  value: FixedAssetDbData,
): string {
  const data: FixedAssetDbData = {
    id: value.id,
    fiscalPeriodId: value.fiscalPeriodId,
    name: value.name,
    acquisitionDate: value.acquisitionDate,
    acquisitionCost: value.acquisitionCost,
    usefulLife: value.usefulLife,
    depreciationMethod: value.depreciationMethod,
    businessRate: value.businessRate,
    status: value.status,
    disposalDate: value.disposalDate,
    disposalPrice: value.disposalPrice,
    bookAccountId: value.bookAccountId,
  };
  return serializeRecord(data, parseFixedAssetDbData);
}

function validateOpening(value: Record<string, unknown>): void {
  nonBlankString(value, "id");
  nonBlankString(value, "userId");
  nonBlankString(value, "fiscalPeriodId");
  isoTimestamp(value, "createdAt");
  isoTimestamp(value, "updatedAt");
  const openingBalanceLines = arrayValue(value, "openingBalanceLines");
  const openingJournals = arrayValue(value, "openingJournals");
  assertOpeningCollectionSizeLimits(openingBalanceLines, openingJournals);
  const validatedOpeningBalanceLines = openingBalanceLines.map((item) => {
    const line = asObject(item, "opening balance line");
    const id = nonBlankString(line, "id");
    const accountId = nonBlankString(line, "accountId");
    assertOpeningBalanceAccountId(
      accountId,
      "opening balance accountId",
    );
    return { id, accountId, amount: nonNegativeInteger(line, "amount") };
  });
  assertUniqueObjectValues(
    validatedOpeningBalanceLines,
    "id",
    "opening balance line",
  );
  assertUniqueAccountIds(
    validatedOpeningBalanceLines.map((line) => line.accountId),
    "opening balance lines",
  );
  openingJournals.forEach((item) => {
    const journal = asObject(item, "opening journal");
    nonBlankString(journal, "id");
    isoDate(journal, "date");
    stringValue(journal, "description");
    unitRate(journal, "businessRate");
    const lines = arrayValue(journal, "lines");
    const validatedLines = lines.map(parseOpeningJournalLine);
    assertUniqueObjectValues(validatedLines, "id", "opening journal line");
    assertEntryLinesBalanced(
      validatedLines,
      "opening journal",
      { allowZero: true },
    );
  });
  assertUniqueObjectValues(openingJournals, "id", "opening journal");
}

function assertOpeningCollectionSizeLimits(
  openingBalanceLines: unknown[],
  openingJournals: unknown[],
): void {
  if (openingBalanceLines.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Opening balance lines exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      null,
    );
  }
  if (openingJournals.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Opening journals exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      null,
    );
  }
  let totalLineCount = 0;
  for (const journal of openingJournals) {
    if (
      typeof journal !== "object" ||
      journal == null ||
      Array.isArray(journal)
    ) {
      continue;
    }
    const lines = asObject(journal, "opening journal").lines;
    if (!Array.isArray(lines)) continue;
    totalLineCount += lines.length;
    if (
      !Number.isSafeInteger(totalLineCount) ||
      totalLineCount > MAX_ENTRY_IMPORT_LINES
    ) {
      throw serverValidationError(
        `Opening journal lines exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
        null,
      );
    }
  }
}

function parseOpeningJournalLine(value: unknown): EntryDbLine {
  const line = asObject(value, "opening journal line");
  return {
    id: nonBlankString(line, "id"),
    side: enumValue(line, "side", ["debit", "credit"]),
    bookAccountId: nonBlankString(line, "bookAccountId"),
    amount: nonNegativeInteger(line, "amount"),
    partnerName: stringValue(line, "partnerName"),
    taxCategoryId: stringValue(line, "taxCategoryId"),
    businessCategoryId: stringValue(line, "businessCategoryId"),
  };
}

function decodeRecord<Output>(
  json: string,
  label: string,
  decode: (value: Record<string, unknown>) => Output,
): Output {
  try {
    return decode(asObject(JSON.parse(json), label));
  } catch (error) {
    throw new Error(
      `Invalid ${label} data in SQLite: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function serializeRecord<Value>(
  value: Value,
  validate: (json: string) => Value,
): string {
  const json = JSON.stringify(value);
  validate(json);
  return json;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError(`${label} must be an object`, null);
  }
  return value as Record<string, unknown>;
}

function stringValue(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw serverValidationError(`${key} must be a string`, null);
  }
  return value;
}

function nonBlankString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = stringValue(record, key);
  if (value.trim() === "") {
    throw serverValidationError(`${key} must not be blank`, null);
  }
  return value;
}

function nullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw serverValidationError(`${key} must be a string or null`, null);
  }
  return value;
}

function booleanValue(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw serverValidationError(`${key} must be a boolean`, null);
  }
  return value;
}

function finiteNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw serverValidationError(`${key} must be a finite number`, null);
  }
  return value;
}

function nonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = finiteNumber(record, key);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw serverValidationError(`${key} must be a non-negative safe integer`, null);
  }
  return value;
}

function nullableNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
): number | null {
  if (!(key in record)) {
    throw serverValidationError(`${key} must be a non-negative safe integer or null`, null);
  }
  return record[key] === null ? null : nonNegativeInteger(record, key);
}

function positiveInteger(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = finiteNumber(record, key);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw serverValidationError(`${key} must be a positive safe integer`, null);
  }
  return value;
}

function unitRate(record: Record<string, unknown>, key: string): number {
  const rate = finiteNumber(record, key);
  if (rate < 0 || rate > 1) throw serverValidationError(`${key} must be between 0 and 1`, null);
  return rate;
}

function isoDate(record: Record<string, unknown>, key: string): string {
  const value = stringValue(record, key);
  if (parseIsoDate(value) == null) {
    throw serverValidationError(`${key} must be an ISO date`, null);
  }
  return value;
}

function nullableIsoDate(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return nullableString(record, key) === null
    ? null
    : isoDate(record, key);
}

function nullableIsoTimestamp(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return nullableString(record, key) === null
    ? null
    : isoTimestamp(record, key);
}

function isoTimestamp(record: Record<string, unknown>, key: string): string {
  const timestamp = stringValue(record, key);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    throw serverValidationError(`${key} must be an ISO timestamp`, null);
  }
  return timestamp;
}

function assertUniqueObjectValues(
  values: unknown[],
  key: string,
  label: string,
): void {
  const seen = new Set<unknown>();
  for (const value of values) {
    const field = asObject(value, label)[key];
    if (seen.has(field)) throw serverValidationError(`${label} ${key} must be unique`, null);
    seen.add(field);
  }
}

function validateFiscalPeriodLifecycle(value: Record<string, unknown>): void {
  const phase = value.phase;
  const settingsCompleted = value.settingsCompleted;
  const openingBalancesCompleted = value.openingBalancesCompleted;
  const documentsReceivedCompleted = value.documentsReceivedCompleted;
  if (
    (phase === "pre_opening" ? settingsCompleted : !settingsCompleted) ||
    ((phase === "pre_closing" || phase === "post_closing") &&
      !openingBalancesCompleted) ||
    (documentsReceivedCompleted && phase !== "post_closing") ||
    (value.archiveDataAvailable === false && value.archiveStatus !== "archived") ||
    (value.archiveStatus === "active" && value.archivedAt != null)
  ) {
    throw serverValidationError("fiscal period lifecycle fields are inconsistent", null);
  }
}

function enumValue<const Value extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly Value[],
): Value {
  const value = record[key];
  if (typeof value === "string") {
    for (const candidate of allowed) {
      if (candidate === value) return candidate;
    }
  }
  throw serverValidationError(`${key} has an unsupported value`, null);
}

function arrayValue(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw serverValidationError(`${key} must be an array`, null);
  return value;
}
