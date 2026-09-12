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
  FiscalPeriodDataColumn,
  FixedAssetDataColumn,
} from "./table-types.js";

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

export function parseFiscalPeriodDataColumn(
  json: string,
): FiscalPeriodDataColumn {
  return decodeRecord(json, "fiscal period", (value) => {
    const id = requiredNonBlankString(value, "id");
    const name = requiredNonBlankString(value, "name");
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
    const settingsCompleted = requiredBoolean(value, "settingsCompleted");
    const openingBalancesCompleted = requiredBoolean(
      value,
      "openingBalancesCompleted",
    );
    const documentsReceivedCompleted = requiredBoolean(
      value,
      "documentsReceivedCompleted",
    );
    const archiveDataAvailable = requiredBoolean(
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

export function serializeFiscalPeriodDataColumn(
  value: FiscalPeriodDataColumn,
): string {
  const data: FiscalPeriodDataColumn = {
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
  return serializeRecord(data, parseFiscalPeriodDataColumn);
}

export function validateOpeningDbRecord(
  opening: FiscalPeriodOpeningDbRecord,
): void {
  assertOpeningCollectionSizeLimits(
    opening.openingBalanceLines,
    opening.openingJournals,
  );
  decodeRecord(JSON.stringify(opening), "opening", (value) => {
    validateOpening(value);
  });
}

export function parseFixedAssetDataColumn(json: string): FixedAssetDataColumn {
  return decodeRecord(json, "fixed asset", (value) => {
    const id = requiredNonBlankString(value, "id");
    const fiscalPeriodId = requiredNonBlankString(value, "fiscalPeriodId");
    const name = requiredNonBlankString(value, "name");
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
    const disposalPrice = requiredNullableNonNegativeInteger(
      value,
      "disposalPrice",
    );
    const bookAccountId = requiredNonBlankString(value, "bookAccountId");
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

export function serializeFixedAssetDataColumn(
  value: FixedAssetDataColumn,
): string {
  const data: FixedAssetDataColumn = {
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
  return serializeRecord(data, parseFixedAssetDataColumn);
}

function validateOpening(value: Record<string, unknown>): void {
  requiredNonBlankString(value, "id");
  requiredNonBlankString(value, "userId");
  requiredNonBlankString(value, "fiscalPeriodId");
  isoTimestamp(value, "createdAt");
  isoTimestamp(value, "updatedAt");
  const openingBalanceLines = arrayValue(value, "openingBalanceLines");
  const openingJournals = arrayValue(value, "openingJournals");
  assertOpeningCollectionSizeLimits(openingBalanceLines, openingJournals);
  const validatedOpeningBalanceLines = openingBalanceLines.map((item) => {
    const line = asObject(item, "opening balance line");
    const id = requiredNonBlankString(line, "id");
    const accountId = requiredNonBlankString(line, "accountId");
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
    requiredNonBlankString(journal, "id");
    isoDate(journal, "date");
    requiredString(journal, "description");
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
    id: requiredNonBlankString(line, "id"),
    side: enumValue(line, "side", ["debit", "credit"]),
    bookAccountId: requiredNonBlankString(line, "bookAccountId"),
    amount: nonNegativeInteger(line, "amount"),
    partnerName: requiredString(line, "partnerName"),
    taxCategoryId: requiredString(line, "taxCategoryId"),
    businessCategoryId: requiredString(line, "businessCategoryId"),
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
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

function requiredNonBlankString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = requiredString(record, key);
  if (value.trim() === "") {
    throw new Error(`${key} must not be blank`);
  }
  return value;
}

function requiredNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(`${key} must be a string or null`);
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function finiteNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

function nonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = finiteNumber(record, key);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative safe integer`);
  }
  return value;
}

function requiredNullableNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
): number | null {
  if (!(key in record)) {
    throw new Error(`${key} must be a non-negative safe integer or null`);
  }
  return record[key] === null ? null : nonNegativeInteger(record, key);
}

function positiveInteger(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = finiteNumber(record, key);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive safe integer`);
  }
  return value;
}

function unitRate(record: Record<string, unknown>, key: string): number {
  const rate = finiteNumber(record, key);
  if (rate < 0 || rate > 1) throw new Error(`${key} must be between 0 and 1`);
  return rate;
}

function isoDate(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (parseIsoDate(value) == null) {
    throw new Error(`${key} must be an ISO date`);
  }
  return value;
}

function nullableIsoDate(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return requiredNullableString(record, key) === null
    ? null
    : isoDate(record, key);
}

function nullableIsoTimestamp(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return requiredNullableString(record, key) === null
    ? null
    : isoTimestamp(record, key);
}

function isoTimestamp(record: Record<string, unknown>, key: string): string {
  const timestamp = requiredString(record, key);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    throw new Error(`${key} must be an ISO timestamp`);
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
    if (seen.has(field)) throw new Error(`${label} ${key} must be unique`);
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
    throw new Error("fiscal period lifecycle fields are inconsistent");
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
  throw new Error(`${key} has an unsupported value`);
}

function arrayValue(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
}
