import { parseIsoDate } from "@rubydogjp/openkk-server-domain";
import type {
  EntryDbLine,
  FiscalPeriodDbRecord,
  FiscalPeriodOpeningDbRecord,
  FixedAssetDbRecord,
} from "../persistence-types";

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function parseFiscalPeriodDbRecord(json: string): FiscalPeriodDbRecord {
  return decodeRecord(json, "fiscal period", (value) => {
    requiredString(value, "id");
    requiredString(value, "name");
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
    if (value.opening !== undefined && value.opening !== null) {
      validateOpening(objectValue(value, "opening"));
    }
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
  decodeRecord(JSON.stringify(opening), "opening", (value) => {
    validateOpening(value);
  });
}

export function parseFixedAssetDbRecord(json: string): FixedAssetDbRecord {
  return decodeRecord(json, "fixed asset", (value) => {
    requiredString(value, "id");
    requiredString(value, "fiscalPeriodId");
    requiredString(value, "name");
    isoDate(value, "acquisitionDate");
    nonNegativeNumber(value, "acquisitionCost");
    positiveInteger(value, "usefulLife");
    enumValue(value, "depreciationMethod", ["straight_line"]);
    unitRate(value, "businessRate");
    enumValue(value, "status", ["active", "sold", "disposed", "retired"]);
    requiredString(value, "disposalDate");
    if (value.disposalDate !== "") isoDate(value, "disposalDate");
    nonNegativeNumber(value, "disposalPrice");
    requiredString(value, "bookAccountId");
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
  requiredString(value, "id");
  requiredString(value, "userId");
  requiredString(value, "fiscalPeriodId");
  optionalArray(value, "openingBalanceLines")?.forEach((item) => {
    const line = asObject(item, "opening balance line");
    requiredString(line, "id");
    requiredString(line, "accountId");
    nonNegativeNumber(line, "amount");
  });
  optionalArray(value, "openingJournals")?.forEach((item) => {
    const journal = asObject(item, "opening journal");
    requiredString(journal, "id");
    isoDate(journal, "date");
    requiredString(journal, "description");
    unitRate(journal, "businessRate");
    arrayValue(journal, "lines").forEach((line) => {
      const record = asObject(line, "opening journal line");
      requiredString(record, "id");
      validateEntryLine(record);
    });
  });
}

function validateEntryLine(value: unknown): asserts value is EntryDbLine {
  const line = asObject(value, "entry line");
  enumValue(line, "side", ["debit", "credit"]);
  requiredString(line, "bookAccountId");
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
  finiteNumber(value, key);
  if ((value[key] as number) < 0)
    throw new Error(`${key} must not be negative`);
}

function positiveInteger(value: Record<string, unknown>, key: string): void {
  if (!Number.isInteger(value[key]) || (value[key] as number) < 1) {
    throw new Error(`${key} must be a positive integer`);
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

function optionalArray(
  value: Record<string, unknown>,
  key: string,
): unknown[] | undefined {
  return value[key] === undefined ? undefined : arrayValue(value, key);
}
