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
  FiscalPeriodDbRecord,
  FiscalPeriodOpeningDbRecord,
  FixedAssetDbRecord,
} from "../persistence-types.js";

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

export function parseFiscalPeriodDbRecord(json: string): FiscalPeriodDbRecord {
  return decodeRecord(json, "fiscal period", (value) => {
    requiredNonBlankString(value, "id");
    requiredNonBlankString(value, "name");
    isoDate(value, "startDate");
    isoDate(value, "endDate");
    enumValue(value, "phase", [
      "pre_opening",
      "journalizing",
      "pre_closing",
      "post_closing",
    ]);
    enumValue(value, "archiveStatus", ["active", "archived"]);
    requiredBoolean(value, "settingsCompleted");
    requiredBoolean(value, "openingBalancesCompleted");
    requiredBoolean(value, "documentsReceivedCompleted");
    if (value.archiveDataAvailable != null) {
      requiredBoolean(value, "archiveDataAvailable");
    }
    if (value.archivedAt != null) {
      isoTimestamp(value, "archivedAt");
    }
    if (value.opening != null) {
      validateOpening(objectValue(value, "opening"));
    }
    assertDateRange(
      value.startDate as string,
      value.endDate as string,
      "fiscal period",
    );
    validateFiscalPeriodLifecycle(value);
    return value as FiscalPeriodDbRecord;
  });
}

export function serializeFiscalPeriodDbRecord(
  value: FiscalPeriodDbRecord,
): string {
  const {
    opening: _opening,
    userId: _userId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...stored
  } = value;
  return serializeRecord(stored, parseFiscalPeriodDbRecord);
}

export function validateOpeningDbRecord(
  opening: FiscalPeriodOpeningDbRecord,
): void {
  assertOpeningCollectionSizeLimits(
    opening.openingBalanceLines ?? [],
    opening.openingJournals ?? [],
  );
  decodeRecord(JSON.stringify(opening), "opening", (value) => {
    validateOpening(value);
  });
}

export function parseFixedAssetDbRecord(json: string): FixedAssetDbRecord {
  return decodeRecord(json, "fixed asset", (value) => {
    requiredNonBlankString(value, "id");
    requiredNonBlankString(value, "fiscalPeriodId");
    requiredNonBlankString(value, "name");
    isoDate(value, "acquisitionDate");
    positiveInteger(value, "acquisitionCost");
    positiveInteger(value, "usefulLife");
    enumValue(value, "depreciationMethod", ["straight_line"]);
    unitRate(value, "businessRate");
    enumValue(value, "status", ["active", "sold", "disposed", "retired"]);
    requiredString(value, "disposalDate");
    if (value.disposalDate !== "") isoDate(value, "disposalDate");
    nonNegativeNumber(value, "disposalPrice");
    requiredNonBlankString(value, "bookAccountId");
    return value as FixedAssetDbRecord;
  });
}

export function serializeFixedAssetDbRecord(value: FixedAssetDbRecord): string {
  const {
    userId: _userId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...stored
  } = value;
  return serializeRecord(stored, parseFixedAssetDbRecord);
}

function validateOpening(value: Record<string, unknown>): void {
  requiredNonBlankString(value, "id");
  requiredNonBlankString(value, "userId");
  requiredNonBlankString(value, "fiscalPeriodId");
  isoTimestamp(value, "createdAt");
  isoTimestamp(value, "updatedAt");
  const openingBalanceLines = nullableArray(value, "openingBalanceLines") ?? [];
  const openingJournals = nullableArray(value, "openingJournals") ?? [];
  assertOpeningCollectionSizeLimits(openingBalanceLines, openingJournals);
  openingBalanceLines.forEach((item) => {
    const line = asObject(item, "opening balance line");
    requiredNonBlankString(line, "id");
    requiredNonBlankString(line, "accountId");
    assertOpeningBalanceAccountId(
      line.accountId as string,
      "opening balance accountId",
    );
    nonNegativeNumber(line, "amount");
  });
  assertUniqueObjectValues(openingBalanceLines, "id", "opening balance line");
  assertUniqueAccountIds(
    openingBalanceLines.map(
      (item) => asObject(item, "opening balance line").accountId as string,
    ),
    "opening balance lines",
  );
  openingJournals.forEach((item) => {
    const journal = asObject(item, "opening journal");
    requiredNonBlankString(journal, "id");
    isoDate(journal, "date");
    requiredString(journal, "description");
    unitRate(journal, "businessRate");
    const lines = arrayValue(journal, "lines");
    lines.forEach((line) => {
      const record = asObject(line, "opening journal line");
      requiredNonBlankString(record, "id");
      validateEntryLine(record);
    });
    assertUniqueObjectValues(lines, "id", "opening journal line");
    assertEntryLinesBalanced(
      lines.map((line) => {
        const record = asObject(line, "opening journal line");
        return {
          side: record.side as "debit" | "credit",
          amount: record.amount as number,
        };
      }),
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
    );
  }
  if (openingJournals.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Opening journals exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
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
    const lines = (journal as { lines: unknown }).lines;
    if (!Array.isArray(lines)) continue;
    totalLineCount += lines.length;
    if (
      !Number.isSafeInteger(totalLineCount) ||
      totalLineCount > MAX_ENTRY_IMPORT_LINES
    ) {
      throw serverValidationError(
        `Opening journal lines exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
      );
    }
  }
}

function validateEntryLine(value: unknown): asserts value is EntryDbLine {
  const line = asObject(value, "entry line");
  enumValue(line, "side", ["debit", "credit"]);
  requiredNonBlankString(line, "bookAccountId");
  nonNegativeNumber(line, "amount");
  requiredString(line, "partnerName");
  requiredString(line, "taxCategoryId");
  requiredString(line, "businessCategoryId");
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

function serializeRecord<Record>(
  value: Record,
  validate: (json: string) => Record,
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

function objectValue(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return asObject(value[key], key);
}

function requiredString(value: Record<string, unknown>, key: string): void {
  if (typeof value[key] !== "string")
    throw new Error(`${key} must be a string`);
}

function requiredNonBlankString(
  value: Record<string, unknown>,
  key: string,
): void {
  requiredString(value, key);
  if ((value[key] as string).trim() === "") {
    throw new Error(`${key} must not be blank`);
  }
}

function requiredBoolean(value: Record<string, unknown>, key: string): void {
  if (typeof value[key] !== "boolean")
    throw new Error(`${key} must be a boolean`);
}

function finiteNumber(value: Record<string, unknown>, key: string): void {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
    throw new Error(`${key} must be a finite number`);
  }
}

function nonNegativeNumber(value: Record<string, unknown>, key: string): void {
  if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) {
    throw new Error(`${key} must be a non-negative safe integer`);
  }
}

function positiveInteger(value: Record<string, unknown>, key: string): void {
  if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) {
    throw new Error(`${key} must be a positive safe integer`);
  }
}

function unitRate(value: Record<string, unknown>, key: string): void {
  finiteNumber(value, key);
  const rate = value[key] as number;
  if (rate < 0 || rate > 1) throw new Error(`${key} must be between 0 and 1`);
}

function isoDate(value: Record<string, unknown>, key: string): void {
  requiredString(value, key);
  if (parseIsoDate(value[key] as string) == null) {
    throw new Error(`${key} must be an ISO date`);
  }
}

function isoTimestamp(value: Record<string, unknown>, key: string): void {
  requiredString(value, key);
  const timestamp = value[key] as string;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    throw new Error(`${key} must be an ISO timestamp`);
  }
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
  value: Record<string, unknown>,
  key: string,
  allowed: readonly Value[],
): void {
  if (
    typeof value[key] !== "string" ||
    !allowed.includes(value[key] as Value)
  ) {
    throw new Error(`${key} has an unsupported value`);
  }
}

function arrayValue(value: Record<string, unknown>, key: string): unknown[] {
  if (!Array.isArray(value[key])) throw new Error(`${key} must be an array`);
  return value[key];
}

function nullableArray(
  value: Record<string, unknown>,
  key: string,
): unknown[] | null {
  return value[key] == null ? null : arrayValue(value, key);
}
