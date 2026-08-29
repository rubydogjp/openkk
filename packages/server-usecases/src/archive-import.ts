import {
  assertDateRange,
  assertEntryLinesBalanced,
  assertUniqueAccountIds,
  parseIsoDate,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
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
  const manifest = objectValue(input.manifest, "archive manifest");
  const fiscalPeriod = objectValue(input.fiscalPeriod, "archive fiscalPeriod");
  const entries = requireArrayValue(input.entries, "archive entries");
  const fixedAssets = requireArrayValue(
    input.fixedAssets,
    "archive fixedAssets",
  );
  const closings = requireArrayValue(input.closings, "archive closings");
  const manifestFiscalPeriodId = requireString(
    manifest.fiscalPeriodId,
    "archive manifest.fiscalPeriodId",
  );
  const sourceId = requireString(fiscalPeriod.id, "archive fiscalPeriod.id");
  if (sourceId !== manifestFiscalPeriodId) {
    throw serverValidationError(
      "archive fiscalPeriod id does not match manifest",
    );
  }
  const sourceOpening = fiscalPeriod.opening;
  const startDate = requireIsoDate(
    fiscalPeriod.startDate,
    "archive fiscalPeriod.startDate",
  );
  const endDate = requireIsoDate(
    fiscalPeriod.endDate,
    "archive fiscalPeriod.endDate",
  );
  assertDateRange(startDate, endDate, "archive fiscalPeriod");
  const normalizedClosings = closings.map((closing) =>
    normalizeArchivedClosing(objectValue(closing, "archive closing")),
  );
  const expectedClosingYear = Number(endDate.slice(0, 4));
  const closingKeys = new Set<string>();
  for (const closing of normalizedClosings) {
    if (closing.year !== expectedClosingYear) {
      throw serverValidationError(
        `archive closing.year must match fiscal period end year ${expectedClosingYear}`,
      );
    }
    const key = `${closing.kind}:${closing.year}`;
    if (closingKeys.has(key)) {
      throw serverValidationError(`archive closing is duplicated: ${key}`);
    }
    closingKeys.add(key);
  }
  const normalizedEntries = entries.map((entry) =>
    normalizeArchivedEntry(
      objectValue(entry, "archive entry"),
      startDate,
      endDate,
    ),
  );
  const entryLocalIds = new Set<string>();
  for (const entry of normalizedEntries) {
    if (entry.localId == null) continue;
    if (entryLocalIds.has(entry.localId)) {
      throw serverValidationError(
        `archive entry.localId is duplicated: ${entry.localId}`,
      );
    }
    entryLocalIds.add(entry.localId);
  }
  return {
    fiscalPeriod: {
      name: requireString(fiscalPeriod.name, "archive fiscalPeriod.name"),
      startDate,
      endDate,
      phase: normalizeFiscalPeriodPhase(fiscalPeriod.phase),
      archiveStatus: "active" as const,
      settingsCompleted: fiscalPeriod.settingsCompleted === true,
      openingBalancesCompleted: fiscalPeriod.openingBalancesCompleted === true,
      documentsReceivedCompleted:
        fiscalPeriod.documentsReceivedCompleted === true,
      opening:
        sourceOpening == null
          ? undefined
          : normalizeArchivedOpening(sourceOpening, userId),
    },
    entries: normalizedEntries,
    fixedAssets: fixedAssets.map((fixedAsset) =>
      normalizeArchivedFixedAsset(
        objectValue(fixedAsset, "archive fixedAsset"),
      ),
    ),
    preClosings: normalizedClosings
      .filter((closing) => closing.kind === "pre_closing")
      .map(({ year }) => ({ year })),
    closings: normalizedClosings
      .filter((closing) => closing.kind === "closing")
      .map(({ year }) => ({ year })),
  };
}

function normalizeFiscalPeriodPhase(value: unknown) {
  if (
    value === "pre_opening" ||
    value === "journalizing" ||
    value === "pre_closing" ||
    value === "post_closing"
  ) {
    return value;
  }
  throw serverValidationError("archive fiscalPeriod.phase is invalid");
}

function normalizeArchivedOpening(value: unknown, userId: string) {
  const opening = objectValue(value, "archive opening");
  const openingBalanceLines = arrayValue(
    opening.openingBalanceLines,
    "archive openingBalanceLines",
  ).map((line) => {
    const item = objectValue(line, "archive openingBalanceLine");
    return {
      id: requireString(item.id, "archive openingBalanceLine.id"),
      accountId: requireString(
        item.accountId,
        "archive openingBalanceLine.accountId",
      ),
      amount: requireNonNegativeNumber(
        item.amount,
        "archive openingBalanceLine.amount",
      ),
    };
  });
  assertUniqueAccountIds(
    openingBalanceLines.map((line) => line.accountId),
    "archive openingBalanceLines",
  );
  return {
    id: "archive-opening",
    userId,
    fiscalPeriodId: "archive-fiscal-period",
    openingBalanceLines,
    openingJournals: arrayValue(
      opening.openingJournals,
      "archive openingJournals",
    ).map((journal) => {
      const item = objectValue(journal, "archive openingJournal");
      const id = requireString(item.id, "archive openingJournal.id");
      const lines = arrayValue(item.lines, "archive openingJournal.lines").map(
        (line, index) => {
          const lineObject = objectValue(line, "archive openingJournal.line");
          return {
            id:
              typeof lineObject.id === "string"
                ? lineObject.id
                : `${id}-line-${index + 1}`,
            side: normalizeSide(lineObject.side),
            bookAccountId: requireString(
              lineObject.bookAccountId,
              "archive openingJournal.line.bookAccountId",
            ),
            amount: requireNonNegativeNumber(
              lineObject.amount,
              "archive openingJournal.line.amount",
            ),
            partnerName: stringOrEmpty(lineObject.partnerName),
            taxCategoryId: stringOrEmpty(lineObject.taxCategoryId),
            businessCategoryId: stringOrEmpty(lineObject.businessCategoryId),
          };
        },
      );
      // 現行UIが保存する再振替の 0 円下書きも往復可能にする。
      assertEntryLinesBalanced(lines, "archive openingJournal", {
        allowZero: true,
      });
      return {
        id,
        date: requireIsoDate(item.date, "archive openingJournal.date"),
        description: requireStringValue(
          item.description,
          "archive openingJournal.description",
        ),
        businessRate: requireUnitRate(
          item.businessRate,
          "archive openingJournal.businessRate",
        ),
        lines,
      };
    }),
  };
}

function normalizeArchivedEntry(
  value: Record<string, unknown>,
  periodStartDate: string,
  periodEndDate: string,
): EntryUpsertInput {
  const date = requireIsoDate(value.date, "archive entry.date");
  if (date < periodStartDate || date > periodEndDate) {
    throw serverValidationError(
      `archive entry.date must be within fiscal period ${periodStartDate} to ${periodEndDate}`,
    );
  }
  const description = requireString(
    value.description,
    "archive entry.description",
  );
  const localId =
    typeof value.localId === "string" && value.localId !== ""
      ? value.localId
      : typeof value.id === "string"
        ? `archive:${value.id}`
        : undefined;
  const businessRate = requireUnitRate(
    value.businessRate,
    "archive entry.businessRate",
  );
  const lines = arrayValue(value.lines, "archive entry.lines").map((line) => {
    const item = objectValue(line, "archive entry.line");
    return {
      side: normalizeSide(item.side),
      bookAccountId: requireString(
        item.bookAccountId,
        "archive entry.line.bookAccountId",
      ),
      amount: requireNonNegativeNumber(
        item.amount,
        "archive entry.line.amount",
      ),
      partnerName: stringOrEmpty(item.partnerName),
      taxCategoryId: stringOrEmpty(item.taxCategoryId),
      businessCategoryId: stringOrEmpty(item.businessCategoryId),
    };
  });
  assertEntryLinesBalanced(lines, "archive entry");
  return { date, description, localId, businessRate, lines };
}

function normalizeArchivedFixedAsset(value: Record<string, unknown>) {
  const patchInput: FixedAssetPatchInput = {};
  const acquisitionDate = requireIsoDate(
    value.acquisitionDate,
    "archive fixedAsset.acquisitionDate",
  );
  const status =
    typeof value.status === "string"
      ? normalizeFixedAssetStatus(value.status)
      : "active";
  if (status !== "active") {
    patchInput.status = status;
    if (typeof value.disposalDate === "string" && value.disposalDate !== "") {
      patchInput.disposalDate = requireIsoDate(
        value.disposalDate,
        "archive fixedAsset.disposalDate",
      );
    }
    if (typeof value.disposalPrice === "number") {
      patchInput.disposalPrice = requireNonNegativeNumber(
        value.disposalPrice,
        "archive fixedAsset.disposalPrice",
      );
    }
  }
  if (
    (status === "sold" || status === "disposed") &&
    patchInput.disposalDate == null
  ) {
    throw serverValidationError(
      `archive fixedAsset with status ${status} requires disposalDate`,
    );
  }
  if (
    patchInput.disposalDate != null &&
    patchInput.disposalDate < acquisitionDate
  ) {
    throw serverValidationError(
      "archive fixedAsset.disposalDate must not be before acquisitionDate",
    );
  }
  return {
    createInput: {
      name: requireString(value.name, "archive fixedAsset.name"),
      acquisitionDate,
      acquisitionCost: requireNonNegativeNumber(
        value.acquisitionCost,
        "archive fixedAsset.acquisitionCost",
      ),
      usefulLife: requirePositiveInteger(
        value.usefulLife,
        "archive fixedAsset.usefulLife",
      ),
      depreciationMethod: "straight_line" as const,
      businessRate: requireUnitRate(
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
  if (value.kind !== "pre_closing" && value.kind !== "closing") {
    throw serverValidationError("archive closing.kind is invalid");
  }
  return {
    year: requirePositiveInteger(value.year, "archive closing.year"),
    kind: value.kind,
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

function objectValue(
  value: unknown,
  label = "archive value",
): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label = "archive value"): unknown[] {
  if (value == null) return [];
  return requireArrayValue(value, label);
}

function requireArrayValue(value: unknown, label = "archive value"): unknown[] {
  if (!Array.isArray(value)) {
    throw serverValidationError(`${label} must be an array`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw serverValidationError(`${label} is required`);
  }
  return value;
}

function requireStringValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw serverValidationError(`${label} must be a finite number`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (numberValue < 0) {
    throw serverValidationError(
      `${label} must be a non-negative finite number`,
    );
  }
  return numberValue;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw serverValidationError(`${label} must be a positive integer`);
  }
  return numberValue;
}

function requireUnitRate(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (numberValue < 0 || numberValue > 1) {
    throw serverValidationError(`${label} must be between 0 and 1`);
  }
  return numberValue;
}

function requireIsoDate(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (parseIsoDate(text) == null) {
    throw serverValidationError(`${label} is invalid`);
  }
  return text;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}
