import { serverValidationError } from "@rubydogjp/openkk-server-domain";
import type {
  EntryUpsertInput,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodArchiveImportInput,
  FixedAssetPatchInput,
} from "@rubydogjp/openkk-server-ports";

export function normalizeArchiveImportInput(
  input: FiscalPeriodArchiveImportInput,
  userId: string,
): FiscalPeriodArchiveDbImportInput {
  const manifestFiscalPeriodId = requireString(
    input.manifest.fiscalPeriodId,
    "archive manifest.fiscalPeriodId",
  );
  const sourceId = requireString(input.fiscalPeriod.id, "archive fiscalPeriod.id");
  if (sourceId !== manifestFiscalPeriodId) {
    throw serverValidationError(
      "archive fiscalPeriod id does not match manifest",
    );
  }
  const sourceOpening = input.fiscalPeriod.opening;
  return {
    fiscalPeriod: {
      name: requireString(input.fiscalPeriod.name, "archive fiscalPeriod.name"),
      startDate: requireString(
        input.fiscalPeriod.startDate,
        "archive fiscalPeriod.startDate",
      ),
      endDate: requireString(
        input.fiscalPeriod.endDate,
        "archive fiscalPeriod.endDate",
      ),
      stage: normalizeFiscalPeriodStage(input.fiscalPeriod.stage),
      archived: true as const,
      settingsCompleted: input.fiscalPeriod.settingsCompleted === true,
      openingBalancesCompleted:
        input.fiscalPeriod.openingBalancesCompleted === true,
      documentsReceivedCompleted:
        input.fiscalPeriod.documentsReceivedCompleted === true,
      opening:
        sourceOpening == null
          ? undefined
          : normalizeArchivedOpening(sourceOpening, userId),
    },
    entries: input.entries.map(normalizeArchivedEntry),
    fixedAssets: input.fixedAssets.map(normalizeArchivedFixedAsset),
    closings: input.closings.map(normalizeArchivedClosing),
  };
}

function normalizeFiscalPeriodStage(value: unknown) {
  if (
    value === "pre_opening" ||
    value === "journalizing" ||
    value === "post_closing"
  ) {
    return value;
  }
  throw serverValidationError("archive fiscalPeriod.stage is invalid");
}

function normalizeArchivedOpening(value: unknown, userId: string) {
  const opening = objectValue(value);
  return {
    id: "archive-opening",
    userId,
    fiscalPeriodId: "archive-fiscal-period",
    openingBalanceLines: arrayValue(opening.openingBalanceLines).map((line) => {
      const item = objectValue(line);
      return {
        id: requireString(item.id, "archive openingBalanceLine.id"),
        accountId: requireString(
          item.accountId,
          "archive openingBalanceLine.accountId",
        ),
        amount: requireNumber(item.amount, "archive openingBalanceLine.amount"),
      };
    }),
    carryoverJournals: arrayValue(opening.carryoverJournals).map((journal) => {
      const item = objectValue(journal);
      const id = requireString(item.id, "archive carryoverJournal.id");
      return {
        id,
        date: requireString(item.date, "archive carryoverJournal.date"),
        description: requireString(
          item.description,
          "archive carryoverJournal.description",
        ),
        businessRate: requireNumber(
          item.businessRate,
          "archive carryoverJournal.businessRate",
        ),
        lines: arrayValue(item.lines).map((line, index) => {
          const lineObject = objectValue(line);
          return {
            id:
              typeof lineObject.id === "string"
                ? lineObject.id
                : `${id}-line-${index + 1}`,
            side: normalizeSide(lineObject.side),
            bookAccountId: requireString(
              lineObject.bookAccountId,
              "archive carryoverJournal.line.bookAccountId",
            ),
            amount: requireNumber(
              lineObject.amount,
              "archive carryoverJournal.line.amount",
            ),
            partnerName: stringOrEmpty(lineObject.partnerName),
            taxCategoryName: stringOrEmpty(lineObject.taxCategoryName),
            businessCategoryName: stringOrEmpty(lineObject.businessCategoryName),
          };
        }),
      };
    }),
  };
}

function normalizeArchivedEntry(value: Record<string, unknown>): EntryUpsertInput {
  return {
    date: requireString(value.date, "archive entry.date"),
    description: requireString(value.description, "archive entry.description"),
    localId:
      typeof value.localId === "string" && value.localId !== ""
        ? value.localId
        : typeof value.id === "string"
          ? `archive:${value.id}`
          : undefined,
    businessRate: requireNumber(value.businessRate, "archive entry.businessRate"),
    lines: arrayValue(value.lines).map((line) => {
      const item = objectValue(line);
      return {
        side: normalizeSide(item.side),
        bookAccountId: requireString(
          item.bookAccountId,
          "archive entry.line.bookAccountId",
        ),
        amount: requireNumber(item.amount, "archive entry.line.amount"),
        partnerName: stringOrEmpty(item.partnerName),
        taxCategoryName: stringOrEmpty(item.taxCategoryName),
        businessCategoryName: stringOrEmpty(item.businessCategoryName),
      };
    }),
  };
}

function normalizeArchivedFixedAsset(value: Record<string, unknown>) {
  const patchInput: FixedAssetPatchInput = {};
  if (typeof value.status === "string" && value.status !== "active") {
    patchInput.status = normalizeFixedAssetStatus(value.status);
  }
  if (typeof value.disposalDate === "string") {
    patchInput.disposalDate = value.disposalDate;
  }
  if (typeof value.disposalPrice === "number") {
    patchInput.disposalPrice = value.disposalPrice;
  }
  return {
    createInput: {
      name: requireString(value.name, "archive fixedAsset.name"),
      acquisitionDate: requireString(
        value.acquisitionDate,
        "archive fixedAsset.acquisitionDate",
      ),
      acquisitionCost: requireNumber(
        value.acquisitionCost,
        "archive fixedAsset.acquisitionCost",
      ),
      usefulLife: requireNumber(value.usefulLife, "archive fixedAsset.usefulLife"),
      depreciationMethod: "straight_line" as const,
      businessRate: requireNumber(
        value.businessRate,
        "archive fixedAsset.businessRate",
      ),
      bookAccountId: requireString(
        value.bookAccountId,
        "archive fixedAsset.bookAccountId",
      ),
    },
    patchInput,
  };
}

function normalizeArchivedClosing(value: Record<string, unknown>) {
  return {
    year: requireNumber(value.year, "archive closing.year"),
    isProvisional: value.isProvisional === true,
  };
}

function normalizeSide(value: unknown): "debit" | "credit" {
  if (value === "debit" || value === "credit") return value;
  throw serverValidationError("archive line side is invalid");
}

function normalizeFixedAssetStatus(
  value: string,
): "active" | "sold" | "disposed" | "retired" {
  if (
    value === "active" ||
    value === "sold" ||
    value === "disposed" ||
    value === "retired"
  ) {
    return value;
  }
  throw serverValidationError("archive fixedAsset.status is invalid");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError("archive value must be an object");
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw serverValidationError("archive value must be an array");
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw serverValidationError(`${label} is required`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw serverValidationError(`${label} must be a finite number`);
  }
  return value;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}
