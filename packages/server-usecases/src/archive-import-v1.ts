import {
  assertTextFieldLength,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodArchiveContent } from "./archive-import.js";

export function migrateFiscalPeriodArchiveV1(
  content: FiscalPeriodArchiveContent,
  sourceFiscalPeriodId: string,
): FiscalPeriodArchiveContent {
  return {
    fiscalPeriod: {
      ...content.fiscalPeriod,
      opening: migrateOpening(content.fiscalPeriod.opening),
    },
    entries: content.entries.map((value) => {
      const entry = objectValue(value, "archive entry");
      return {
        ...entry,
        fiscalPeriodId: childFiscalPeriodId(
          entry.fiscalPeriodId,
          sourceFiscalPeriodId,
        ),
        localId: migrateEntryLocalId(entry.localId, entry.id),
        lines: legacyArray(entry.lines, "archive entry.lines").map((line) =>
          migrateEntryLine(line, "archive entry.line"),
        ),
      };
    }),
    fixedAssets: content.fixedAssets.map((value) => {
      const asset = objectValue(value, "archive fixedAsset");
      const status = asset.status == null ? "active" : asset.status;
      return {
        ...asset,
        fiscalPeriodId: childFiscalPeriodId(
          asset.fiscalPeriodId,
          sourceFiscalPeriodId,
        ),
        status,
        disposalDate:
          asset.disposalDate == null || asset.disposalDate === ""
            ? null
            : asset.disposalDate,
        disposalPrice:
          asset.disposalPrice == null ||
          (status !== "sold" && asset.disposalPrice === 0)
            ? null
            : asset.disposalPrice,
      };
    }),
    closings: content.closings.map((value) => {
      const closing = objectValue(value, "archive closing");
      return {
        ...closing,
        fiscalPeriodId: childFiscalPeriodId(
          closing.fiscalPeriodId,
          sourceFiscalPeriodId,
        ),
      };
    }),
  };
}

function migrateOpening(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const opening = objectValue(value, "archive opening");
  return {
    ...opening,
    openingBalanceLines: legacyArray(
      opening.openingBalanceLines,
      "archive openingBalanceLines",
    ),
    openingJournals: legacyArray(
      opening.openingJournals,
      "archive openingJournals",
    ).map((value) => {
      const journal = objectValue(value, "archive openingJournal");
      const id = requiredString(journal.id, "archive openingJournal.id");
      return {
        ...journal,
        lines: legacyArray(
          journal.lines,
          "archive openingJournal.lines",
        ).map((line, index) => {
          const lineRecord = objectValue(
            line,
            "archive openingJournal.line",
          );
          return {
            ...migrateEntryLineRecord(
              lineRecord,
              "archive openingJournal.line",
            ),
            id: optionalId(
              lineRecord.id,
              `${id}-line-${index + 1}`,
              "archive openingJournal.line.id",
            ),
          };
        }),
      };
    }),
  };
}

function migrateEntryLine(
  value: unknown,
  label: string,
): Record<string, unknown> {
  return migrateEntryLineRecord(objectValue(value, label), label);
}

function migrateEntryLineRecord(
  line: Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  return {
    ...line,
    partnerName: optionalText(line.partnerName, `${label}.partnerName`),
    taxCategoryId: categoryId(
      line.taxCategoryId,
      `${label}.taxCategoryId`,
      DEFAULT_TAX_CATEGORIES,
    ),
    businessCategoryId: categoryId(
      line.businessCategoryId,
      `${label}.businessCategoryId`,
      DEFAULT_BUSINESS_CATEGORIES,
    ),
  };
}

function categoryId(
  value: unknown,
  label: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string {
  const text = optionalText(value, label);
  if (text === "") return "";
  return (
    categories.find(
      (category) => category.id === text || category.name === text,
    )?.id ?? text
  );
}

function childFiscalPeriodId(
  value: unknown,
  sourceFiscalPeriodId: string,
): unknown {
  return value == null ? sourceFiscalPeriodId : value;
}

function optionalId(value: unknown, fallback: string, label: string): string {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  return value.trim() === "" ? fallback : value;
}

function migrateEntryLocalId(
  value: unknown,
  archivedEntryId: unknown,
): string | null {
  if (value != null) {
    if (typeof value !== "string") {
      throw serverValidationError("archive entry.localId must be a string", null);
    }
    if (value.trim() !== "") return value;
  }
  if (archivedEntryId == null) return null;
  if (typeof archivedEntryId !== "string") {
    throw serverValidationError("archive entry.id must be a string", null);
  }
  return archivedEntryId.trim() === "" ? null : `archive:${archivedEntryId}`;
}

function optionalText(value: unknown, label: string): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  assertTextFieldLength(value, label);
  return value;
}

function legacyArray(value: unknown, label: string): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw serverValidationError(`${label} must be an array`, null);
  }
  return value;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError(`${label} must be an object`, null);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  if (value.trim() === "") {
    throw serverValidationError(`${label} is required`, null);
  }
  return value;
}
