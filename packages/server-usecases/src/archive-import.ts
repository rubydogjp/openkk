import {
  assertDateRange,
  assertEntryLinesBalanced,
  assertTextFieldLength,
  assertOpeningBalanceAccountId,
  assertUniqueAccountIds,
  computeFixedAssetBookValue,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  getDefaultBookAccount,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
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
  const archive = objectValue(input, "archive");
  const manifest = objectValue(archive.manifest, "archive manifest");
  const fiscalPeriod = objectValue(
    archive.fiscalPeriod,
    "archive fiscalPeriod",
  );
  const entries = requireArrayValue(archive.entries, "archive entries");
  const fixedAssets = requireArrayValue(
    archive.fixedAssets,
    "archive fixedAssets",
  );
  const closings = requireArrayValue(archive.closings, "archive closings");
  assertArchiveImportSizeLimits({
    fiscalPeriod,
    entries,
    fixedAssets,
    closings,
  });
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
  if (manifest.format !== "openkk.fiscal-period-archive") {
    throw serverValidationError("archive manifest.format is invalid");
  }
  if (manifest.version !== 1) {
    throw serverValidationError("archive manifest.version is not supported");
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
  const periodName = requireString(
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
    );
  }
  const normalizedClosings = closings.map((closing) =>
    normalizeArchivedClosing(
      objectValue(closing, "archive closing"),
      sourceId,
    ),
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
      sourceId,
    ),
  );
  const entryLocalIds = new Set<string>();
  for (const entry of normalizedEntries) {
    assertArchivedEntryMasterReferences(entry);
    if (entry.localId == null) continue;
    if (entryLocalIds.has(entry.localId)) {
      throw serverValidationError(
        `archive entry.localId is duplicated: ${entry.localId}`,
      );
    }
    entryLocalIds.add(entry.localId);
  }
  const phase = normalizeFiscalPeriodPhase(fiscalPeriod.phase);
  const settingsCompleted = requireBoolean(
    fiscalPeriod.settingsCompleted,
    "archive fiscalPeriod.settingsCompleted",
  );
  const openingBalancesCompleted = requireBoolean(
    fiscalPeriod.openingBalancesCompleted,
    "archive fiscalPeriod.openingBalancesCompleted",
  );
  const documentsReceivedCompleted = requireBoolean(
    fiscalPeriod.documentsReceivedCompleted,
    "archive fiscalPeriod.documentsReceivedCompleted",
  );
  const normalizedOpening =
    sourceOpening == null
      ? null
      : normalizeArchivedOpening(
          sourceOpening,
          userId,
          startDate,
          endDate,
          openingBalancesCompleted,
        );
  const normalizedFixedAssets = fixedAssets.map((fixedAsset) =>
    normalizeArchivedFixedAsset(
      objectValue(fixedAsset, "archive fixedAsset"),
      startDate,
      endDate,
      sourceId,
    ),
  );
  assertArchiveLifecycle({
    phase,
    settingsCompleted,
    openingBalancesCompleted,
    documentsReceivedCompleted,
    opening: normalizedOpening,
    closingKeys,
  });
  return {
    fiscalPeriod: {
      name: periodName,
      startDate,
      endDate,
      phase,
      archiveStatus: "active" as const,
      settingsCompleted,
      openingBalancesCompleted,
      documentsReceivedCompleted,
      opening: normalizedOpening,
    },
    entries: normalizedEntries,
    fixedAssets: normalizedFixedAssets,
    preClosings: normalizedClosings
      .filter((closing) => closing.kind === "pre_closing")
      .map(({ year }) => ({ year })),
    closings: normalizedClosings
      .filter((closing) => closing.kind === "closing")
      .map(({ year }) => ({ year })),
  };
}

function assertArchiveImportSizeLimits(input: {
  fiscalPeriod: Record<string, unknown>;
  entries: unknown[];
  fixedAssets: unknown[];
  closings: unknown[];
}): void {
  assertArchiveCollectionItemLimit(input.entries, "entries");
  assertArchiveCollectionItemLimit(input.fixedAssets, "fixedAssets");
  if (input.closings.length > 2) {
    throw serverValidationError(
      "archive closings exceeds the 2 item limit",
      "圧縮済みファイルの決算記録件数が多すぎます",
    );
  }

  let totalLineCount = 0;
  for (const entry of input.entries) {
    totalLineCount = addArchiveLineCount(totalLineCount, entry);
  }

  const opening = input.fiscalPeriod.opening;
  if (typeof opening === "object" && opening != null && !Array.isArray(opening)) {
    const openingRecord = opening as Record<string, unknown>;
    const openingBalanceLines = openingRecord.openingBalanceLines;
    if (Array.isArray(openingBalanceLines)) {
      assertArchiveCollectionItemLimit(
        openingBalanceLines,
        "openingBalanceLines",
      );
    }
    const openingJournals = openingRecord.openingJournals;
    if (Array.isArray(openingJournals)) {
      assertArchiveCollectionItemLimit(openingJournals, "openingJournals");
      for (const journal of openingJournals) {
        totalLineCount = addArchiveLineCount(totalLineCount, journal);
      }
    }
  }
}

function assertArchiveCollectionItemLimit(
  items: unknown[],
  label: string,
): void {
  if (items.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `archive ${label} exceeds the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      "圧縮済みファイルのデータ件数が多すぎます",
    );
  }
}

function addArchiveLineCount(total: number, value: unknown): number {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return total;
  }
  const lines = (value as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) return total;
  const next = total + lines.length;
  if (!Number.isSafeInteger(next) || next > MAX_ENTRY_IMPORT_LINES) {
    throw serverValidationError(
      `archive journal lines exceeds the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
      "圧縮済みファイルの仕訳明細数が多すぎます",
    );
  }
  return next;
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

function normalizeArchivedOpening(
  value: unknown,
  userId: string,
  periodStartDate: string,
  periodEndDate: string,
  openingBalancesCompleted: boolean,
) {
  const opening = objectValue(value, "archive opening");
  const openingBalanceLines = arrayValue(
    opening.openingBalanceLines,
    "archive openingBalanceLines",
  ).map((line) => {
    const item = objectValue(line, "archive openingBalanceLine");
    const accountId = requireString(
      item.accountId,
      "archive openingBalanceLine.accountId",
    );
    assertOpeningBalanceAccountId(
      accountId,
      "archive openingBalanceLine.accountId",
    );
    return {
      id: requireString(item.id, "archive openingBalanceLine.id"),
      accountId,
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
  assertUniqueIds(openingBalanceLines, "archive openingBalanceLines");
  const openingJournals = arrayValue(
    opening.openingJournals,
    "archive openingJournals",
  ).map((journal) => {
    const item = objectValue(journal, "archive openingJournal");
    const id = requireString(item.id, "archive openingJournal.id");
    const lines = arrayValue(item.lines, "archive openingJournal.lines").map(
      (line, index) => {
        const lineObject = objectValue(line, "archive openingJournal.line");
        return {
          id: legacyOptionalId(
            lineObject.id,
            `${id}-line-${index + 1}`,
            "archive openingJournal.line.id",
          ),
          side: normalizeSide(lineObject.side),
          bookAccountId: requireString(
            lineObject.bookAccountId,
            "archive openingJournal.line.bookAccountId",
          ),
          amount: requireNonNegativeNumber(
            lineObject.amount,
            "archive openingJournal.line.amount",
          ),
          partnerName: optionalString(
            lineObject.partnerName,
            "archive openingJournal.line.partnerName",
          ),
          taxCategoryId: normalizeTaxCategoryId(
            lineObject.taxCategoryId,
            "archive openingJournal.line.taxCategoryId",
          ),
          businessCategoryId: normalizeBusinessCategoryId(
            lineObject.businessCategoryId,
            "archive openingJournal.line.businessCategoryId",
          ),
        };
      },
    );
    assertUniqueIds(lines, `archive openingJournal ${id} lines`);
    assertEntryLinesBalanced(lines, "archive openingJournal", {
      allowZero: true,
    });
    const date = requireIsoDate(item.date, "archive openingJournal.date");
    if (date < periodStartDate || date > periodEndDate) {
      throw serverValidationError(
        `archive openingJournal.date must be within fiscal period ${periodStartDate} to ${periodEndDate}`,
      );
    }
    assertArchivedEntryMasterReferences({ lines });
    return {
      id,
      date,
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
  });
  assertUniqueIds(openingJournals, "archive openingJournals");
  if (openingBalancesCompleted) {
    assertArchivedOpeningBalancesBalanced(openingBalanceLines);
  }
  return {
    id: "archive-opening",
    userId,
    fiscalPeriodId: "archive-fiscal-period",
    openingBalanceLines,
    openingJournals,
  };
}

function normalizeArchivedEntry(
  value: Record<string, unknown>,
  periodStartDate: string,
  periodEndDate: string,
  sourceFiscalPeriodId: string,
): EntryUpsertInput {
  assertV1CompatibleSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive entry.fiscalPeriodId",
  );
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
  const localId = archivedEntryLocalId(value.localId, value.id);
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
      partnerName: optionalString(
        item.partnerName,
        "archive entry.line.partnerName",
      ),
      taxCategoryId: normalizeTaxCategoryId(
        item.taxCategoryId,
        "archive entry.line.taxCategoryId",
      ),
      businessCategoryId: normalizeBusinessCategoryId(
        item.businessCategoryId,
        "archive entry.line.businessCategoryId",
      ),
    };
  });
  assertEntryLinesBalanced(lines, "archive entry", { allowZero: false });
  return { date, description, localId, businessRate, lines };
}

function normalizeArchivedFixedAsset(
  value: Record<string, unknown>,
  periodStartDate: string,
  periodEndDate: string,
  sourceFiscalPeriodId: string,
) {
  assertV1CompatibleSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive fixedAsset.fiscalPeriodId",
  );
  const patchInput: FixedAssetPatchInput = { name: null, acquisitionDate: null, acquisitionCost: null, usefulLife: null, depreciationMethod: null, businessRate: null, status: null, disposalDate: null, disposalPrice: null, bookAccountId: null };
  const acquisitionDate = requireIsoDate(
    value.acquisitionDate,
    "archive fixedAsset.acquisitionDate",
  );
  const status =
    value.status == null
      ? "active"
      : normalizeFixedAssetStatus(
          requireStringValue(value.status, "archive fixedAsset.status"),
        );
  if (acquisitionDate > periodEndDate) {
    throw serverValidationError(
      `archive fixedAsset.acquisitionDate must not be after fiscal period end ${periodEndDate}`,
    );
  }
  if (value.depreciationMethod !== "straight_line") {
    throw serverValidationError(
      "archive fixedAsset.depreciationMethod is invalid",
    );
  }
  const disposalDate =
    value.disposalDate == null || value.disposalDate === ""
      ? ""
      : requireIsoDate(
          value.disposalDate,
          "archive fixedAsset.disposalDate",
        );
  const disposalPrice =
    value.disposalPrice == null
      ? 0
      : requireNonNegativeNumber(
          value.disposalPrice,
          "archive fixedAsset.disposalPrice",
        );
  if (
    (status === "active" || status === "retired") &&
    (disposalDate !== "" || disposalPrice !== 0)
  ) {
    throw serverValidationError(
      `archive ${status} fixedAsset must not contain disposal data`,
    );
  }
  if (status === "disposed" && disposalPrice !== 0) {
    throw serverValidationError(
      "archive disposed fixedAsset must not contain a disposal price",
    );
  }
  if (status !== "active") {
    patchInput.status = status;
    if (disposalDate !== "") patchInput.disposalDate = disposalDate;
    if (disposalPrice !== 0) patchInput.disposalPrice = disposalPrice;
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
  if (
    patchInput.disposalDate != null &&
    (patchInput.disposalDate < periodStartDate ||
      patchInput.disposalDate > periodEndDate)
  ) {
    throw serverValidationError(
      `archive fixedAsset.disposalDate must be within fiscal period ${periodStartDate} to ${periodEndDate}`,
    );
  }
  const bookAccountId = requireString(
    value.bookAccountId,
    "archive fixedAsset.bookAccountId",
  );
  const account = getDefaultBookAccount(bookAccountId);
  if (
    account == null ||
    account.accountType !== "asset" ||
    account.balanceSheetSection !== "fixed_asset"
  ) {
    throw serverValidationError(
      `archive fixedAsset.bookAccountId must reference a fixed-asset account: ${bookAccountId}`,
    );
  }
  const acquisitionCost = requirePositiveInteger(
    value.acquisitionCost,
    "archive fixedAsset.acquisitionCost",
  );
  const usefulLife = requirePositiveInteger(
    value.usefulLife,
    "archive fixedAsset.usefulLife",
  );
  if (usefulLife > MAX_FIXED_ASSET_USEFUL_LIFE_YEARS) {
    throw serverValidationError(
      `archive fixedAsset.usefulLife must not exceed ${MAX_FIXED_ASSET_USEFUL_LIFE_YEARS} years`,
    );
  }
  if (
    status === "retired" &&
    computeFixedAssetBookValue({
      acquisitionDate,
      acquisitionCost,
      usefulLife,
      asOf: periodEndDate,
    }) > 1
  ) {
    throw serverValidationError(
      "archive retired fixedAsset has not reached memorandum value at fiscal period end",
    );
  }
  return {
    createInput: {
      name: requireString(value.name, "archive fixedAsset.name"),
      acquisitionDate,
      acquisitionCost,
      usefulLife,
      depreciationMethod: "straight_line" as const,
      businessRate: requireUnitRate(
        value.businessRate,
        "archive fixedAsset.businessRate",
      ),
      bookAccountId,
    },
    patchInput,
  };
}

function normalizeArchivedClosing(
  value: Record<string, unknown>,
  sourceFiscalPeriodId: string,
) {
  assertV1CompatibleSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive closing.fiscalPeriodId",
  );
  if (value.kind !== "pre_closing" && value.kind !== "closing") {
    throw serverValidationError("archive closing.kind is invalid");
  }
  return {
    year: requirePositiveInteger(value.year, "archive closing.year"),
    kind: value.kind,
  };
}

function normalizeTaxCategoryId(value: unknown, label: string): string {
  return normalizeCategoryId(value, label, DEFAULT_TAX_CATEGORIES);
}

function normalizeBusinessCategoryId(value: unknown, label: string): string {
  return normalizeCategoryId(value, label, DEFAULT_BUSINESS_CATEGORIES);
}

function normalizeCategoryId(
  value: unknown,
  label: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string {
  const text = optionalString(value, label);
  if (text === "") return "";
  const category = categories.find(
    (candidate) => candidate.id === text || candidate.name === text,
  );
  return category?.id ?? text;
}

function assertUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  label: string,
): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw serverValidationError(`${label} has a duplicate id: ${item.id}`);
    }
    ids.add(item.id);
  }
}

function assertV1CompatibleSourceFiscalPeriodId(
  value: unknown,
  sourceFiscalPeriodId: string,
  label: string,
): void {
  if (value == null) return;
  const id = requireString(value, label);
  if (id !== sourceFiscalPeriodId) {
    throw serverValidationError(`${label} does not match archive fiscalPeriod`);
  }
}

function assertArchivedEntryMasterReferences(input: {
  lines: Array<{
    bookAccountId: string;
    taxCategoryId: string;
    businessCategoryId: string;
  }>;
}) {
  for (const line of input.lines) {
    if (getDefaultBookAccount(line.bookAccountId) == null) {
      throw serverValidationError(
        `archive line references unknown bookAccountId: ${line.bookAccountId}`,
      );
    }
  }
}

function assertArchivedOpeningBalancesBalanced(
  lines: Array<{ accountId: string; amount: number }>,
) {
  let assets = 0;
  let liabilitiesAndEquity = 0;
  for (const line of lines) {
    if (line.accountId.startsWith("a:")) {
      assets += line.amount;
    } else if (line.accountId.startsWith("l:")) {
      liabilitiesAndEquity += line.amount;
    } else {
      throw serverValidationError(
        `archive openingBalanceLine.accountId must start with a: or l:: ${line.accountId}`,
      );
    }
    if (
      !Number.isSafeInteger(assets) ||
      !Number.isSafeInteger(liabilitiesAndEquity)
    ) {
      throw serverValidationError(
        "archive opening balance totals exceed the safe integer range",
      );
    }
  }
  if (assets !== liabilitiesAndEquity) {
    throw serverValidationError(
      `archive opening balances must balance: assets ${assets}, liabilities and equity ${liabilitiesAndEquity}`,
    );
  }
}

function assertArchiveLifecycle(input: {
  phase: "pre_opening" | "journalizing" | "pre_closing" | "post_closing";
  settingsCompleted: boolean;
  openingBalancesCompleted: boolean;
  documentsReceivedCompleted: boolean;
  opening: {
    openingJournals: Array<{
      description: string;
      lines: Array<{ side: "debit" | "credit"; amount: number }>;
    }>;
  } | null;
  closingKeys: Set<string>;
}) {
  if (input.documentsReceivedCompleted && input.phase !== "post_closing") {
    throw serverValidationError(
      "archive documentsReceivedCompleted requires post_closing phase",
    );
  }
  if (input.openingBalancesCompleted && input.opening == null) {
    throw serverValidationError(
      "archive completed opening balances require opening data",
    );
  }
  if (input.openingBalancesCompleted && input.opening != null) {
    for (const journal of input.opening.openingJournals) {
      if (journal.description.trim() === "") {
        throw serverValidationError(
          "archive completed openingJournal description is required",
        );
      }
      assertEntryLinesBalanced(
        journal.lines,
        "archive completed openingJournal",
        { allowZero: false },
      );
    }
  }
  const hasPreClosing = [...input.closingKeys].some((key) =>
    key.startsWith("pre_closing:"),
  );
  const hasClosing = [...input.closingKeys].some((key) =>
    key.startsWith("closing:"),
  );
  if (input.phase === "pre_opening") {
    if (input.settingsCompleted || hasPreClosing || hasClosing) {
      throw serverValidationError(
        "archive pre_opening lifecycle flags are inconsistent",
      );
    }
    return;
  }
  if (!input.settingsCompleted) {
    throw serverValidationError(
      `archive ${input.phase} phase requires settingsCompleted`,
    );
  }
  if (input.phase === "journalizing") {
    if (hasPreClosing || hasClosing) {
      throw serverValidationError(
        "archive journalizing phase must not contain closing records",
      );
    }
    return;
  }
  if (!input.openingBalancesCompleted) {
    throw serverValidationError(
      `archive ${input.phase} phase requires completed opening balances`,
    );
  }
  if (input.phase === "pre_closing") {
    if (!hasPreClosing || hasClosing) {
      throw serverValidationError(
        "archive pre_closing phase requires only a pre-closing record",
      );
    }
    return;
  }
  if (!hasPreClosing || !hasClosing) {
    throw serverValidationError(
      "archive post_closing phase requires pre-closing and closing records",
    );
  }
}

function normalizeSide(value: unknown): "debit" | "credit" {
  if (value === "debit" || value === "credit") return value;
  throw serverValidationError("archive line side is invalid");
}

function legacyOptionalId(
  value: unknown,
  fallback: string,
  label: string,
): string {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`);
  }
  return value.trim() === "" ? fallback : value;
}

function archivedEntryLocalId(
  value: unknown,
  archivedEntryId: unknown,
): string | null {
  if (value != null) {
    if (typeof value !== "string") {
      throw serverValidationError("archive entry.localId must be a string");
    }
    if (value.trim() !== "") return value;
  }
  if (archivedEntryId == null) return null;
  if (typeof archivedEntryId !== "string") {
    throw serverValidationError("archive entry.id must be a string");
  }
  return archivedEntryId.trim() === "" ? null : `archive:${archivedEntryId}`;
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

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw serverValidationError(`${label} must be a boolean`);
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
  if (numberValue < 0 || !Number.isSafeInteger(numberValue)) {
    throw serverValidationError(
      `${label} must be a non-negative finite number and a safe integer`,
    );
  }
  return numberValue;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (!Number.isSafeInteger(numberValue) || numberValue < 1) {
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

function optionalString(value: unknown, label: string): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`);
  }
  assertTextFieldLength(value, label);
  return value;
}
