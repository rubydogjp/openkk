import {
  assertDateRange,
  assertFiscalPeriodArchiveState,
  assertFiscalPeriodLifecycleFlags,
  assertOpeningMatchesRules,
  parseIsoDate,
  requireObject,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodOpeningDbRecord } from "@rubydogjp/openkk-server-ports";
import type {
  FiscalPeriodDbData,
  FixedAssetDbData,
} from "./table-types.js";

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
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
      "purged",
    ]);
    const openingBalancesCompleted = booleanValue(
      value,
      "openingBalancesCompleted",
    );
    const documentsReceivedCompleted = booleanValue(
      value,
      "documentsReceivedCompleted",
    );
    const archivedAt = nullableValue(value, "archivedAt", isoTimestamp);
    assertDateRange(startDate, endDate, "fiscal period");
    assertFiscalPeriodLifecycleFlags(
      {
        phase,
        openingBalancesCompleted,
        documentsReceivedCompleted,
      },
      "fiscal period",
    );
    assertFiscalPeriodArchiveState(
      { archiveStatus, archivedAt },
      "fiscal period",
    );
    return {
      id,
      name,
      startDate,
      endDate,
      phase,
      archiveStatus,
      archivedAt,
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
    archivedAt: value.archivedAt,
    openingBalancesCompleted: value.openingBalancesCompleted,
    documentsReceivedCompleted: value.documentsReceivedCompleted,
  };
  return serializeRecord(data, parseFiscalPeriodDbData);
}

export function validateOpeningDbRecord(
  opening: FiscalPeriodOpeningDbRecord,
): void {
  assertOpeningMatchesRules(opening, null, "Stored opening", {
    completed: false,
  });
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
    const disposalDate = nullableValue(value, "disposalDate", isoDate);
    const disposalPrice = nullableValue(
      value,
      "disposalPrice",
      nonNegativeInteger,
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

function decodeRecord<Output>(
  json: string,
  label: string,
  decode: (value: Record<string, unknown>) => Output,
): Output {
  try {
    return decode(requireObject(JSON.parse(json), label));
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

function nullableValue<Value>(
  record: Record<string, unknown>,
  key: string,
  read: (record: Record<string, unknown>, key: string) => Value,
): Value | null {
  if (!(key in record)) {
    throw serverValidationError(`${key} is required`, null);
  }
  return record[key] === null ? null : read(record, key);
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

function isoTimestamp(record: Record<string, unknown>, key: string): string {
  const timestamp = stringValue(record, key);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    throw serverValidationError(`${key} must be an ISO timestamp`, null);
  }
  return timestamp;
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
