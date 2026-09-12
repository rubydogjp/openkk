import {
  assertDateRange,
  assertEntryLinesBalanced,
  assertTextFieldLength,
  assertOpeningBalanceAccountId,
  assertUniqueAccountIds,
  computeFixedAssetBookValue,
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
  userId: string,
): FiscalPeriodArchiveDbImportInput {
  const archive = objectValue(input, "archive");
  const manifest = objectValue(archive.manifest, "archive manifest");
  const sourceFiscalPeriod = objectValue(
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
  assertArchiveImportSizeLimits({
    fiscalPeriod: sourceFiscalPeriod,
    entries: sourceEntries,
    fixedAssets: sourceFixedAssets,
    closings: sourceClosings,
  });
  const manifestFiscalPeriodId = requireString(
    manifest.fiscalPeriodId,
    "archive manifest.fiscalPeriodId",
  );
  const sourceId = requireString(
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
      ? migrateFiscalPeriodArchiveV1(content, sourceId)
      : content;
  const sourceOpening = fiscalPeriod.opening;
  if (sourceOpening === undefined) {
    throw serverValidationError(
      "archive fiscalPeriod.opening must be null or an object",
      null,
    );
  }
  const startDate = requireIsoDate(
    fiscalPeriod.startDate,
    "archive fiscalPeriod.startDate",
  );
  const endDate = requireIsoDate(
    fiscalPeriod.endDate,
    "archive fiscalPeriod.endDate",
  );
  assertDateRange(startDate, endDate, "archive fiscalPeriod");
  const periodName = requireText(
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
        null,
      );
    }
    const key = `${closing.kind}:${closing.year}`;
    if (closingKeys.has(key)) {
      throw serverValidationError(`archive closing is duplicated: ${key}`, null);
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
        null,
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
  throw serverValidationError("archive fiscalPeriod.phase is invalid", null);
}

function normalizeArchivedOpening(
  value: unknown,
  userId: string,
  periodStartDate: string,
  periodEndDate: string,
  openingBalancesCompleted: boolean,
) {
  const opening = objectValue(value, "archive opening");
  const openingBalanceLines = requireArrayValue(
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
  const openingJournals = requireArrayValue(
    opening.openingJournals,
    "archive openingJournals",
  ).map((journal) => {
    const item = objectValue(journal, "archive openingJournal");
    const id = requireString(item.id, "archive openingJournal.id");
    const lines = requireArrayValue(
      item.lines,
      "archive openingJournal.lines",
    ).map((line) => {
      const lineObject = objectValue(line, "archive openingJournal.line");
      return {
        id: requireString(
          lineObject.id,
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
        partnerName: requireTextValue(
          lineObject.partnerName,
          "archive openingJournal.line.partnerName",
        ),
        taxCategoryId: requireTextValue(
          lineObject.taxCategoryId,
          "archive openingJournal.line.taxCategoryId",
        ),
        businessCategoryId: requireTextValue(
          lineObject.businessCategoryId,
          "archive openingJournal.line.businessCategoryId",
        ),
      };
    });
    assertUniqueIds(lines, `archive openingJournal ${id} lines`);
    assertEntryLinesBalanced(lines, "archive openingJournal", {
      allowZero: true,
    });
    const date = requireIsoDate(item.date, "archive openingJournal.date");
    if (date < periodStartDate || date > periodEndDate) {
      throw serverValidationError(
        `archive openingJournal.date must be within fiscal period ${periodStartDate} to ${periodEndDate}`,
        null,
      );
    }
    assertArchivedEntryMasterReferences({ lines });
    return {
      id,
      date,
      description: requireTextValue(
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
  assertSourceFiscalPeriodId(
    value.fiscalPeriodId,
    sourceFiscalPeriodId,
    "archive entry.fiscalPeriodId",
  );
  const date = requireIsoDate(value.date, "archive entry.date");
  if (date < periodStartDate || date > periodEndDate) {
    throw serverValidationError(
      `archive entry.date must be within fiscal period ${periodStartDate} to ${periodEndDate}`,
      null,
    );
  }
  const description = requireText(
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
        partnerName: requireTextValue(
          item.partnerName,
          "archive entry.line.partnerName",
        ),
        taxCategoryId: requireTextValue(
          item.taxCategoryId,
          "archive entry.line.taxCategoryId",
        ),
        businessCategoryId: requireTextValue(
          item.businessCategoryId,
          "archive entry.line.businessCategoryId",
        ),
      };
    },
  );
  assertEntryLinesBalanced(lines, "archive entry", { allowZero: false });
  return { date, description, localId, businessRate, lines };
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
    requireStringValue(value.status, "archive fixedAsset.status"),
  );
  if (acquisitionDate > periodEndDate) {
    throw serverValidationError(
      `archive fixedAsset.acquisitionDate must not be after fiscal period end ${periodEndDate}`,
      null,
    );
  }
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
  const archivedDisposalPrice =
    value.disposalPrice === null
      ? null
      : requireNonNegativeNumber(
          value.disposalPrice,
          "archive fixedAsset.disposalPrice",
        );
  const disposalPrice = archivedDisposalPrice;
  if (
    (status === "active" || status === "retired") &&
    (disposalDate != null || disposalPrice != null)
  ) {
    throw serverValidationError(
      `archive ${status} fixedAsset must not contain disposal data`,
      null,
    );
  }
  if (status === "disposed" && disposalPrice != null) {
    throw serverValidationError(
      "archive disposed fixedAsset must not contain a disposal price",
      null,
    );
  }
  if (status === "sold" && disposalPrice == null) {
    throw serverValidationError(
      "archive sold fixedAsset requires disposalPrice",
      null,
    );
  }
  if ((status === "sold" || status === "disposed") && disposalDate == null) {
    throw serverValidationError(
      `archive fixedAsset with status ${status} requires disposalDate`,
      null,
    );
  }
  if (disposalDate != null && disposalDate < acquisitionDate) {
    throw serverValidationError(
      "archive fixedAsset.disposalDate must not be before acquisitionDate",
      null,
    );
  }
  if (
    disposalDate != null &&
    (disposalDate < periodStartDate || disposalDate > periodEndDate)
  ) {
    throw serverValidationError(
      `archive fixedAsset.disposalDate must be within fiscal period ${periodStartDate} to ${periodEndDate}`,
      null,
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
      null,
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
      null,
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
      null,
    );
  }
  return {
    name: requireText(value.name, "archive fixedAsset.name"),
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

function assertUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  label: string,
): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      throw serverValidationError(`${label} has a duplicate id: ${item.id}`, null);
    }
    ids.add(item.id);
  }
}

function assertSourceFiscalPeriodId(
  value: unknown,
  sourceFiscalPeriodId: string,
  label: string,
): void {
  const id = requireString(value, label);
  if (id !== sourceFiscalPeriodId) {
    throw serverValidationError(`${label} does not match archive fiscalPeriod`, null);
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
        null,
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
        null,
      );
    }
    if (
      !Number.isSafeInteger(assets) ||
      !Number.isSafeInteger(liabilitiesAndEquity)
    ) {
      throw serverValidationError(
        "archive opening balance totals exceed the safe integer range",
        null,
      );
    }
  }
  if (assets !== liabilitiesAndEquity) {
    throw serverValidationError(
      `archive opening balances must balance: assets ${assets}, liabilities and equity ${liabilitiesAndEquity}`,
      null,
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
      null,
    );
  }
  if (input.openingBalancesCompleted && input.opening == null) {
    throw serverValidationError(
      "archive completed opening balances require opening data",
      null,
    );
  }
  if (input.openingBalancesCompleted && input.opening != null) {
    for (const journal of input.opening.openingJournals) {
      if (journal.description.trim() === "") {
        throw serverValidationError(
          "archive completed openingJournal description is required",
          null,
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
        null,
      );
    }
    return;
  }
  if (!input.settingsCompleted) {
    throw serverValidationError(
      `archive ${input.phase} phase requires settingsCompleted`,
      null,
    );
  }
  if (input.phase === "journalizing") {
    if (hasPreClosing || hasClosing) {
      throw serverValidationError(
        "archive journalizing phase must not contain closing records",
        null,
      );
    }
    return;
  }
  if (!input.openingBalancesCompleted) {
    throw serverValidationError(
      `archive ${input.phase} phase requires completed opening balances`,
      null,
    );
  }
  if (input.phase === "pre_closing") {
    if (!hasPreClosing || hasClosing) {
      throw serverValidationError(
        "archive pre_closing phase requires only a pre-closing record",
        null,
      );
    }
    return;
  }
  if (!hasPreClosing || !hasClosing) {
    throw serverValidationError(
      "archive post_closing phase requires pre-closing and closing records",
      null,
    );
  }
}

function normalizeSide(value: unknown): "debit" | "credit" {
  if (value === "debit" || value === "credit") return value;
  throw serverValidationError("archive line side is invalid", null);
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
  throw serverValidationError("archive fixedAsset.status is invalid", null);
}

function objectValue(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw serverValidationError(`${label} must be an object`, null);
  }
  return value as Record<string, unknown>;
}

function requireArrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw serverValidationError(`${label} must be an array`, null);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
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

function requireText(value: unknown, label: string): string {
  const text = requireString(value, label);
  assertTextFieldLength(text, label);
  return text;
}

function requireStringValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
  return value;
}

function requireTextValue(value: unknown, label: string): string {
  const text = requireStringValue(value, label);
  assertTextFieldLength(text, label);
  return text;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw serverValidationError(`${label} must be a boolean`, null);
  }
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw serverValidationError(`${label} must be a finite number`, null);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (numberValue < 0 || !Number.isSafeInteger(numberValue)) {
    throw serverValidationError(
      `${label} must be a non-negative finite number and a safe integer`,
      null,
    );
  }
  return numberValue;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (!Number.isSafeInteger(numberValue) || numberValue < 1) {
    throw serverValidationError(`${label} must be a positive integer`, null);
  }
  return numberValue;
}

function requireUnitRate(value: unknown, label: string): number {
  const numberValue = requireNumber(value, label);
  if (numberValue < 0 || numberValue > 1) {
    throw serverValidationError(`${label} must be between 0 and 1`, null);
  }
  return numberValue;
}

function requireIsoDate(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (parseIsoDate(text) == null) {
    throw serverValidationError(`${label} is invalid`, null);
  }
  return text;
}

function requireArchiveVersion(value: unknown): FiscalPeriodArchiveVersion {
  if (value === 1 || value === 2) return value;
  throw serverValidationError("archive manifest.version is not supported", null);
}
