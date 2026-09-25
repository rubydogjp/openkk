import {
  assertDateRange,
  assertNonBlankString,
  assertOpeningMatchesRules,
  assertPositiveInteger,
  assertUniqueStrings,
  MAX_ENTRY_IMPORT_ITEMS,
  requireObject,
  serverConflictError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  FiscalPeriodApiPhase,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodNextCreateInput,
  FiscalPeriodOpeningApiRecord,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankTextField,
  assertOptionalBoolean,
  assertString,
  assertTextFieldChange,
} from "./common-validation.js";

export function assertPeriodDataAvailable(
  period: FiscalPeriodApiRecord,
  operation: string,
): void {
  if (period.archiveStatus === "purged") {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot ${operation} after archived data was purged`,
      "この会計期間の実データは削除済みです",
    );
  }
}

function assertMutableFiscalPeriod(
  period: FiscalPeriodApiRecord,
  operation: string,
): void {
  if (period.archiveStatus !== "active") {
    throw archivedFiscalPeriodError(
      `Archived fiscal period ${period.id} cannot ${operation}`,
    );
  }
}

export function assertPeriodPhase(
  period: FiscalPeriodApiRecord,
  expectedPhase: FiscalPeriodApiPhase,
  operation: string,
): void {
  assertPeriodPhaseOneOf(period, [expectedPhase], operation);
}

export function assertPeriodPhaseOneOf(
  period: FiscalPeriodApiRecord,
  expectedPhases: FiscalPeriodApiPhase[],
  operation: string,
): void {
  assertMutableFiscalPeriod(period, operation);
  if (!expectedPhases.includes(period.phase)) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot ${operation} from phase ${period.phase}`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
}

export function assertClosingYear(
  period: FiscalPeriodApiRecord,
  year: unknown,
): asserts year is number {
  assertPositiveInteger(year, "Closing year");
  const expectedYear = Number(period.endDate.slice(0, 4));
  if (year !== expectedYear) {
    throw serverValidationError(
      `Closing year ${year} must match fiscal period end year ${expectedYear}`,
      "締め年度が会計期間の終了年と一致しません",
    );
  }
}

export function assertFiscalPeriodReadyForPreClosing(
  period: FiscalPeriodApiRecord,
): void {
  if (!period.openingBalancesCompleted) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot run pre-closing before opening balances are completed`,
      "期首残高を完了してから仮締めしてください",
    );
  }
  assertOpeningMatchesRules(period.opening, period, "Opening", {
    completed: true,
  });
}

export function archivedFiscalPeriodError(messageForDeveloper: string) {
  return serverConflictError(
    messageForDeveloper,
    "圧縮保存済みの会計期間は変更できません",
  );
}

export function assertFiscalPeriodCreateInput(
  input: unknown,
): asserts input is FiscalPeriodCreateInput {
  const value = requireObject(input, "Fiscal period input");
  assertNonBlankTextField(value.name, "Fiscal period name");
  assertDateRange(value.startDate, value.endDate, "Fiscal period");
}

export function assertFiscalPeriodNextCreateInput(
  input: unknown,
): asserts input is FiscalPeriodNextCreateInput {
  assertFiscalPeriodCreateInput(input);
  const value = requireObject(input, "Fiscal period input");
  assertNonBlankString(value.sourceFiscalPeriodId, "Source fiscal period id");
  if (
    typeof value.carryBalances !== "boolean" ||
    typeof value.carryFixedAssets !== "boolean"
  ) {
    throw serverValidationError("Carryover options must be booleans", null);
  }
  if (
    !Array.isArray(value.reversalEntryIds) ||
    value.reversalEntryIds.length > MAX_ENTRY_IMPORT_ITEMS
  ) {
    throw serverValidationError(
      "Reversal entry ids must be a bounded array",
      null,
    );
  }
  assertUniqueStrings(
    value.reversalEntryIds,
    "Reversal entry id",
    "同じ仕訳が再振替に重複して指定されています",
  );
}

export function assertNoOverlappingFiscalPeriod(
  input: { startDate: string; endDate: string },
  existingPeriods: FiscalPeriodApiRecord[],
): void {
  const overlap = existingPeriods.find(
    (period) =>
      period.archiveStatus === "active" &&
      input.startDate <= period.endDate &&
      input.endDate >= period.startDate,
  );
  if (overlap != null) {
    throw serverConflictError(
      `Fiscal period ${input.startDate} to ${input.endDate} overlaps active fiscal period ${overlap.id} (${overlap.startDate} to ${overlap.endDate})`,
      "既存の会計期間と日付が重複しています",
    );
  }
}

export function assertFiscalPeriodContainsExistingData(
  period: Pick<FiscalPeriodApiRecord, "startDate" | "endDate">,
  entries: ReadonlyArray<Pick<EntryApiRecord, "id" | "date">>,
  fixedAssets: ReadonlyArray<
    Pick<
      FixedAssetApiRecord,
      "id" | "acquisitionDate" | "disposalDate" | "status"
    >
  >,
): void {
  const entryOutsidePeriod = entries.find(
    (entry) => entry.date < period.startDate || entry.date > period.endDate,
  );
  if (entryOutsidePeriod != null) {
    throw serverValidationError(
      `Entry ${entryOutsidePeriod.id} date ${entryOutsidePeriod.date} ` +
        `must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "保存済みの仕訳を含む範囲に会計期間を設定してください",
    );
  }

  const acquisitionAfterPeriod = fixedAssets.find(
    (asset) => asset.acquisitionDate > period.endDate,
  );
  if (acquisitionAfterPeriod != null) {
    throw serverValidationError(
      `Fixed asset ${acquisitionAfterPeriod.id} acquisition date ` +
        `${acquisitionAfterPeriod.acquisitionDate} must not be after ` +
        `fiscal period end ${period.endDate}`,
      "保存済みの固定資産取得日を含む終了日にしてください",
    );
  }

  const disposalOutsidePeriod = fixedAssets.find(
    (asset) =>
      (asset.status === "sold" || asset.status === "disposed") &&
      asset.disposalDate != null &&
      (asset.disposalDate < period.startDate ||
        asset.disposalDate > period.endDate),
  );
  if (disposalOutsidePeriod != null) {
    throw serverValidationError(
      `Fixed asset ${disposalOutsidePeriod.id} disposal date ` +
        `${disposalOutsidePeriod.disposalDate} must be within fiscal period ` +
        `${period.startDate} to ${period.endDate}`,
      "保存済みの固定資産処分日を含む範囲に会計期間を設定してください",
    );
  }
}

export function assertFiscalPeriodPatchInput(
  current: FiscalPeriodApiRecord,
  patch: unknown,
): asserts patch is FiscalPeriodPatchInput {
  const value = requireObject(patch, "Fiscal period patch");
  if (value.name !== undefined) {
    assertNonBlankString(value.name, "Fiscal period name");
    assertTextFieldChange(value.name, current.name, "Fiscal period name");
  }
  if (value.startDate !== undefined) {
    assertString(value.startDate, "Fiscal period start date");
  }
  if (value.endDate !== undefined) {
    assertString(value.endDate, "Fiscal period end date");
  }
  assertOptionalBoolean(
    value.openingBalancesCompleted,
    "Fiscal period openingBalancesCompleted",
  );
  assertOptionalBoolean(
    value.documentsReceivedCompleted,
    "Fiscal period documentsReceivedCompleted",
  );
  const startDate =
    value.startDate === undefined ? current.startDate : value.startDate;
  const endDate =
    value.endDate === undefined ? current.endDate : value.endDate;
  assertDateRange(startDate, endDate, "Fiscal period");
  const opening = value.opening === undefined ? current.opening : value.opening;
  assertOpeningMatchesRules(opening, { startDate, endDate }, "Opening", {
    completed:
      typeof value.openingBalancesCompleted === "boolean"
        ? value.openingBalancesCompleted
        : current.openingBalancesCompleted,
  });
  if (value.opening !== undefined) {
    assertOpeningTextChanges(opening, current.opening);
  }
}

function assertOpeningTextChanges(
  opening: FiscalPeriodOpeningApiRecord,
  current: FiscalPeriodOpeningApiRecord,
): void {
  const savedJournals = new Map(
    current.journals.map((journal) => [journal.id, journal]),
  );
  for (const journal of opening.journals) {
    const savedJournal = savedJournals.get(journal.id) ?? null;
    assertTextFieldChange(
      journal.description,
      savedJournal?.description ?? null,
      "Opening journal description",
    );
    const savedLines = new Map(
      savedJournal?.lines.map((line) => [line.id, line]) ?? [],
    );
    for (const line of journal.lines) {
      const savedLine = savedLines.get(line.id) ?? null;
      assertTextFieldChange(
        line.partnerName,
        savedLine?.partnerName ?? null,
        "Opening journal line partner",
      );
      assertTextFieldChange(
        line.taxCategoryId,
        savedLine?.taxCategoryId ?? null,
        "Opening journal line tax category",
      );
      assertTextFieldChange(
        line.businessCategoryId,
        savedLine?.businessCategoryId ?? null,
        "Opening journal line business category",
      );
    }
  }
}
