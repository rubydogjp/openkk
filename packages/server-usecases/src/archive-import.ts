import {
  assertDateRange,
  assertEntryMatchesRules,
  assertFiscalPeriodArchiveSize,
  assertFiscalPeriodClosingMarkers,
  assertFiscalPeriodLifecycleFlags,
  assertFixedAssetMatchesRules,
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertOpeningMatchesRules,
  assertPositiveInteger,
  assertUniqueStrings,
  assertUnitRate,
  requireObject,
  serverValidationError,
  type EntrySide,
  type FiscalPeriodPhase,
  type FixedAssetStatus,
  type Opening,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryUpsertInput,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodArchiveImportInput,
  FixedAssetDbImportInput,
} from "@rubydogjp/openkk-server-ports";
import { migrateFiscalPeriodArchiveV1 } from "./archive-import-v1.js";

type FiscalPeriodArchiveVersion = 1 | 2;

export type FiscalPeriodArchiveContent = {
  fiscalPeriod: Record<string, unknown>;
  entries: unknown[];
  fixedAssets: unknown[];
  closings: unknown[];
};

export function normalizeArchiveImportInput(
  input: FiscalPeriodArchiveImportInput,
): FiscalPeriodArchiveDbImportInput {
  const archive = requireObject(input, "archive");
  const manifest = requireObject(archive.manifest, "archive manifest");
  const sourceFiscalPeriod = requireObject(
    archive.fiscalPeriod,
    "archive fiscalPeriod",
  );
  const sourceEntries = requireArrayValue(archive.entries, "archive entries");
  const sourceFixedAssets = requireArrayValue(
    archive.fixedAssets,
    "archive fixedAssets",
  );
  const sourceClosings = requireArrayValue(
    archive.closings,
    "archive closings",
  );
  assertFiscalPeriodArchiveSize([
    manifest, sourceFiscalPeriod, sourceEntries, sourceFixedAssets, sourceClosings,
  ]);
  if (sourceClosings.length > 2) {
    throw serverValidationError("archive closings exceeds the 2 item limit", null);
  }
  const manifestFiscalPeriodId = requireNonBlankString(
    manifest.fiscalPeriodId,
    "archive manifest.fiscalPeriodId",
  );
  const sourceId = requireNonBlankString(
    sourceFiscalPeriod.id,
    "archive fiscalPeriod.id",
  );
  if (sourceId !== manifestFiscalPeriodId) {
    throw serverValidationError(
      "archive fiscalPeriod id does not match manifest",
      null,
    );
  }
  if (manifest.format !== "openkk.fiscal-period-archive") {
    throw serverValidationError("archive manifest.format is invalid", null);
  }
  const archiveVersion = requireArchiveVersion(manifest.version);
  const content: FiscalPeriodArchiveContent = {
    fiscalPeriod: sourceFiscalPeriod,
    entries: sourceEntries,
    fixedAssets: sourceFixedAssets,
    closings: sourceClosings,
  };
  const { fiscalPeriod, entries, fixedAssets, closings } =
    archiveVersion === 1
      ? migrateFiscalPeriodArchiveV1(content)
      : content;
  const startDate = requireIsoDate(
    fiscalPeriod.startDate,
    "archive fiscalPeriod.startDate",
  );
  const endDate = requireIsoDate(
    fiscalPeriod.endDate,
    "archive fiscalPeriod.endDate",
  );
  assertDateRange(startDate, endDate, "archive fiscalPeriod");
  const periodName = requireNonBlankString(
    fiscalPeriod.name,
    "archive fiscalPeriod.name",
  );
  if (
    manifest.name !== periodName ||
    manifest.startDate !== startDate ||
    manifest.endDate !== endDate
  ) {
    throw serverValidationError(
      "archive manifest fiscal-period metadata does not match fiscalPeriod",
      null,
    );
  }
  const normalizedClosings = closings.map((closing) =>
    normalizeArchivedClosing(
      requireObject(closing, "archive closing"),
      sourceId,
    ),
  );
  const expectedClosingYear = Number(endDate.slice(0, 4));
  for (const closing of normalizedClosings) {
    if (closing.year !== expectedClosingYear) {
      throw serverValidationError(
        `archive closing.year must match fiscal period end year ${expectedClosingYear}`,
        null,
      );
    }
  }
  assertUniqueStrings(
    normalizedClosings.map((closing) => `${closing.kind}:${closing.year}`),
    "archive closing",
    null,
  );
  const normalizedEntries = entries.map((entry) =>
    normalizeArchivedEntry(
      requireObject(entry, "archive entry"),
      startDate,
      endDate,
      sourceId,
    ),
  );
  assertUniqueStrings(
    normalizedEntries
      .map((entry) => entry.localId)
      .filter((localId) => localId != null),
    "archive entry.localId",
    null,
  );
  const phase = normalizeFiscalPeriodPhase(fiscalPeriod.phase);
  const openingBalancesCompleted = requireBoolean(
    fiscalPeriod.openingBalancesCompleted,
    "archive fiscalPeriod.openingBalancesCompleted",
  );
  const documentsReceivedCompleted = requireBoolean(
    fiscalPeriod.documentsReceivedCompleted,
    "archive fiscalPeriod.documentsReceivedCompleted",
  );
  const normalizedOpening = normalizeArchivedOpening(
    fiscalPeriod.opening,
    { startDate, endDate },
    openingBalancesCompleted,
  );
  const normalizedFixedAssets = fixedAssets.map((fixedAsset) =>
    normalizeArchivedFixedAsset(
      requireObject(fixedAsset, "archive fixedAsset"),
      startDate,
      endDate,
      sourceId,
    ),
  );
  const importedPreClosings = normalizedClosings
    .filter((closing) => closing.kind === "pre_closing")
    .map(({ year }) => ({ year }));
  const importedClosings = normalizedClosings
    .filter((closing) => closing.kind === "closing")
    .map(({ year }) => ({ year }));
  assertArchiveLifecycle({
    phase,
    openingBalancesCompleted,
    documentsReceivedCompleted,
    preClosingCount: importedPreClosings.length,
    closingCount: importedClosings.length,
  });
  return {
    fiscalPeriod: {
      name: periodName,
      startDate,
      endDate,
      phase,
      openingBalancesCompleted,
      documentsReceivedCompleted,
      opening: normalizedOpening,
    },
    entries: normalizedEntries,
    fixedAssets: normalizedFixedAssets,
    preClosings: importedPreClosings,
    closings: importedClosings,
  };
}

function normalizeFiscalPeriodPhase(value: unknown): FiscalPeriodPhase {
  if (
    value === "pre_opening" ||
    value === "journalizing" ||
    value === "pre_closing" ||
    value === "post_closing"
  ) {
    return value;
  }
  throw serverValidationError("archive fiscalPeriod.phase is invalid", null);
}

function normalizeArchivedOpening(
  value: unknown,
  period: { startDate: string; endDate: string },
  completed: boolean,
): Opening {
  assertOpeningMatchesRules(value, period, "archive opening", { completed });
  return {
    openingBalanceLines: value.openingBalanceLines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      amount: line.amount,
    })),
    openingJournals: value.openingJournals.map((journal) => ({
      id: journal.id,
      date: journal.date,
      description: journal.description,
      businessRate: journal.businessRate,
      lines: journal.lines.map((line) => ({
        id: line.id,
        side: line.side,
        bookAccountId: line.bookAccountId,
        amount: line.amount,
        partnerName: line.partnerName,
        taxCategoryId: line.taxCategoryId,
        businessCategoryId: line.businessCategoryId,
      })),
    })),
  };
}

function normalizeArchivedEntry(
  value: Record<string, unknown>,
  periodStartDate: string,
  periodEndDate: string,
  sourceFiscalPeriodId: string,
): EntryUpsertInput {
  assertSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive entry.fiscalPeriodId",
  );
  const date = requireIsoDate(value.date, "archive entry.date");
  const description = requireNonBlankString(
    value.description,
    "archive entry.description",
  );
  const localId = requireNullableString(
    value.localId,
    "archive entry.localId",
  );
  const businessRate = requireUnitRate(
    value.businessRate,
    "archive entry.businessRate",
  );
  const lines = requireArrayValue(value.lines, "archive entry.lines").map(
    (line) => {
      const item = requireObject(line, "archive entry.line");
      return {
        side: normalizeSide(item.side),
        bookAccountId: requireNonBlankString(
          item.bookAccountId,
          "archive entry.line.bookAccountId",
        ),
        amount: requireNonNegativeSafeInteger(
          item.amount,
          "archive entry.line.amount",
        ),
        partnerName: requireString(
          item.partnerName,
          "archive entry.line.partnerName",
        ),
        taxCategoryId: requireString(
          item.taxCategoryId,
          "archive entry.line.taxCategoryId",
        ),
        businessCategoryId: requireString(
          item.businessCategoryId,
          "archive entry.line.businessCategoryId",
        ),
      };
    },
  );
  const entry = { date, description, localId, businessRate, lines };
  assertEntryMatchesRules(
    entry,
    { startDate: periodStartDate, endDate: periodEndDate },
    "archive entry",
  );
  return entry;
}

function normalizeArchivedFixedAsset(
  value: Record<string, unknown>,
  periodStartDate: string,
  periodEndDate: string,
  sourceFiscalPeriodId: string,
): FixedAssetDbImportInput {
  assertSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive fixedAsset.fiscalPeriodId",
  );
  const acquisitionDate = requireIsoDate(
    value.acquisitionDate,
    "archive fixedAsset.acquisitionDate",
  );
  const status = normalizeFixedAssetStatus(
    requireString(value.status, "archive fixedAsset.status"),
  );
  if (value.depreciationMethod !== "straight_line") {
    throw serverValidationError(
      "archive fixedAsset.depreciationMethod is invalid",
      null,
    );
  }
  const disposalDate =
    value.disposalDate === null
      ? null
      : requireIsoDate(
          value.disposalDate,
          "archive fixedAsset.disposalDate",
        );
  const disposalPrice =
    value.disposalPrice === null
      ? null
      : requireNonNegativeSafeInteger(
          value.disposalPrice,
          "archive fixedAsset.disposalPrice",
        );
  const bookAccountId = requireNonBlankString(
    value.bookAccountId,
    "archive fixedAsset.bookAccountId",
  );
  const acquisitionCost = requirePositiveInteger(
    value.acquisitionCost,
    "archive fixedAsset.acquisitionCost",
  );
  const usefulLife = requirePositiveInteger(
    value.usefulLife,
    "archive fixedAsset.usefulLife",
  );
  const fixedAsset: FixedAssetDbImportInput = {
    name: requireNonBlankString(value.name, "archive fixedAsset.name"),
    acquisitionDate,
    acquisitionCost,
    usefulLife,
    depreciationMethod: "straight_line",
    businessRate: requireUnitRate(
      value.businessRate,
      "archive fixedAsset.businessRate",
    ),
    status,
    disposalDate,
    disposalPrice,
    bookAccountId,
  };
  assertFixedAssetMatchesRules(fixedAsset, {
    startDate: periodStartDate,
    endDate: periodEndDate,
  });
  return fixedAsset;
}

function normalizeArchivedClosing(
  value: Record<string, unknown>,
  sourceFiscalPeriodId: string,
) {
  assertSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive closing.fiscalPeriodId",
  );
  if (value.kind !== "pre_closing" && value.kind !== "closing") {
    throw serverValidationError("archive closing.kind is invalid", null);
  }
  return {
    year: requirePositiveInteger(value.year, "archive closing.year"),
    kind: value.kind,
  };
}

function assertSourceFiscalPeriodId(
  value: unknown,
  sourceFiscalPeriodId: string,
  label: string,
): void {
  const id = requireNonBlankString(value, label);
  if (id !== sourceFiscalPeriodId) {
    throw serverValidationError(`${label} does not match archive fiscalPeriod`, null);
  }
}

function assertArchiveLifecycle(input: {
  phase: FiscalPeriodPhase;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  preClosingCount: number;
  closingCount: number;
}): void {
  assertFiscalPeriodLifecycleFlags(input, "archive");
  assertFiscalPeriodClosingMarkers(
    input.phase,
    {
      hasPreClosing: input.preClosingCount > 0,
      hasClosing: input.closingCount > 0,
    },
    "archive",
  );
}

function normalizeSide(value: unknown): EntrySide {
  if (value === "debit" || value === "credit") return value;
  throw serverValidationError("archive line side is invalid", null);
}

function normalizeFixedAssetStatus(value: string): FixedAssetStatus {
  if (
    value === "active" ||
    value === "sold" ||
    value === "disposed" ||
    value === "retired"
  ) {
    return value;
  }
  throw serverValidationError("archive fixedAsset.status is invalid", null);
}

function requireArrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw serverValidationError(`${label} must be an array`, null);
  }
  return value;
}

function requireNonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  if (value.trim().length === 0) {
    throw serverValidationError(`${label} is required`, null);
  }
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string or null`, null);
  }
  if (value.trim() === "") {
    throw serverValidationError(`${label} must not be blank`, null);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw serverValidationError(`${label} must be a boolean`, null);
  }
  return value;
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  assertNonNegativeSafeInteger(value, label);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  assertPositiveInteger(value, label);
  return value;
}

function requireUnitRate(value: unknown, label: string): number {
  assertUnitRate(value, label);
  return value;
}

function requireIsoDate(value: unknown, label: string): string {
  const text = requireNonBlankString(value, label);
  assertIsoDate(text, label);
  return text;
}

function requireArchiveVersion(value: unknown): FiscalPeriodArchiveVersion {
  if (value === 1 || value === 2) return value;
  throw serverValidationError("archive manifest.version is not supported", null);
}
