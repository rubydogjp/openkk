import {
  assertCompletedOpening,
  assertDateRange,
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertEntryLineMatchesRules,
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonBlankString,
  assertNonNegativeSafeInteger,
  assertOpeningBalanceAccountId,
  assertPositiveInteger,
  assertUniqueIds,
  assertUniqueStrings,
  assertUnitRate,
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
  FiscalPeriodOpeningInput,
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
  if (
    period.archiveStatus === "archived" &&
    period.archiveDataAvailable === false
  ) {
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
  if (period.archiveStatus === "archived") {
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
  assertMutableFiscalPeriod(period, operation);
  if (period.phase !== expectedPhase) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot ${operation} from phase ${period.phase}`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
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
  if (!period.settingsCompleted) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot run pre-closing before settings are completed`,
      "会計期間の設定を完了してから仮締めしてください",
    );
  }
  if (!period.openingBalancesCompleted) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot run pre-closing before opening balances are completed`,
      "期首残高を完了してから仮締めしてください",
    );
  }
  for (const journal of period.opening.openingJournals) {
    assertEntryLinesBalanced(journal.lines, "Opening journal", {
      allowZero: false,
    });
    for (const line of journal.lines) {
      assertEntryLineMatchesRules(line, "Opening journal");
    }
  }
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
    value.settingsCompleted,
    "Fiscal period settingsCompleted",
  );
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
  const openingWillBeCompleted =
    value.openingBalancesCompleted === true ||
    (value.openingBalancesCompleted === undefined &&
      current.openingBalancesCompleted);

  const patchedOpening = value.opening;
  let opening: FiscalPeriodOpeningInput | null = null;
  if (patchedOpening !== undefined) {
    assertOpeningPatchInput(patchedOpening, {
      current,
      startDate,
      endDate,
      openingWillBeCompleted,
    });
    opening = patchedOpening;
  }
  const effectiveOpening = opening ?? current.opening;
  for (const journal of effectiveOpening.openingJournals) {
    if (journal.date < startDate || journal.date > endDate) {
      throw serverValidationError(
        `Opening journal date ${journal.date} must be within fiscal period ${startDate} to ${endDate}`,
        "期首仕訳の日付を会計期間内にしてください",
      );
    }
  }
  const mustValidateCompletedOpening =
    value.openingBalancesCompleted === true ||
    (current.openingBalancesCompleted && opening != null);
  if (!mustValidateCompletedOpening) return;
  assertCompletedOpening(effectiveOpening, "Opening");
}

function assertOpeningPatchInput(
  opening: unknown,
  context: {
    current: FiscalPeriodApiRecord;
    startDate: string;
    endDate: string;
    openingWillBeCompleted: boolean;
  },
): asserts opening is FiscalPeriodOpeningInput {
  const { current, startDate, endDate, openingWillBeCompleted } = context;
  const value = requireObject(opening, "Opening data");
  if (
    !Array.isArray(value.openingBalanceLines) ||
    !Array.isArray(value.openingJournals)
  ) {
    throw serverValidationError("Opening data must contain line arrays", null);
  }
  assertEntryCollectionItemLimit(
    value.openingBalanceLines,
    "Opening balance lines",
    "期首残高の明細件数が多すぎます",
  );
  assertEntryCollectionItemLimit(
    value.openingJournals,
    "Opening journals",
    "期首再振替の件数が多すぎます",
  );
  assertEntryCollectionLineLimit(
    value.openingJournals,
    "Opening journal lines",
    "期首再振替の明細数が多すぎます",
  );
  assertNonBlankString(value.id, "Opening id");
  assertNonBlankString(value.userId, "Opening user id");
  assertNonBlankString(value.fiscalPeriodId, "Opening fiscal period id");
  if (value.id !== current.opening.id) {
    throw serverValidationError(
      `Opening id ${value.id} must match existing opening ${current.opening.id}`,
      "期首データの識別子が一致しません",
    );
  }
  if (
    value.userId !== current.userId ||
    value.fiscalPeriodId !== current.id
  ) {
    throw serverValidationError(
      "Opening ownership must match the fiscal period",
      "期首データの会計期間情報が一致しません",
    );
  }
  for (const item of value.openingBalanceLines) {
    const line = requireObject(item, "Opening balance line");
    assertNonBlankString(line.accountId, "Opening balance account");
    assertOpeningBalanceAccountId(line.accountId, "Opening balance accountId");
    assertNonBlankString(line.id, "Opening balance line id");
    assertNonNegativeSafeInteger(line.amount, "Opening balance amount");
  }
  assertUniqueStrings(
    value.openingBalanceLines.map((line) => line.accountId),
    "Opening balance accountId",
    "同じ勘定科目の期首残高が重複しています",
  );
  assertUniqueIds(
    value.openingBalanceLines,
    "Opening balance line",
    "同じ識別子のデータが重複しています",
  );
  assertUniqueIds(
    value.openingJournals,
    "Opening journal",
    "同じ識別子のデータが重複しています",
  );
  const savedJournals = new Map(
    current.opening.openingJournals.map((journal) => [journal.id, journal]),
  );
  for (const item of value.openingJournals) {
    const journal = requireObject(item, "Opening journal");
    if (!Array.isArray(journal.lines)) {
      throw serverValidationError(
        "Opening journal must contain a lines array",
        null,
      );
    }
    assertNonBlankString(journal.id, "Opening journal id");
    const savedJournal = savedJournals.get(journal.id) ?? null;
    assertTextFieldChange(
      journal.description,
      savedJournal?.description ?? null,
      "Opening journal description",
    );
    if (openingWillBeCompleted) {
      assertNonBlankString(journal.description, "Opening journal description");
    }
    assertIsoDate(journal.date, "Opening journal date");
    if (journal.date < startDate || journal.date > endDate) {
      throw serverValidationError(
        `Opening journal date ${journal.date} must be within fiscal period ${startDate} to ${endDate}`,
        "期首仕訳の日付を会計期間内にしてください",
      );
    }
    assertUnitRate(journal.businessRate, "Opening journal business rate");
    assertUniqueIds(
      journal.lines,
      `Opening journal ${journal.id} line`,
      "同じ識別子のデータが重複しています",
    );
    const savedLines = new Map(
      savedJournal?.lines.map((line) => [line.id, line]) ?? [],
    );
    for (const lineItem of journal.lines) {
      const line = requireObject(lineItem, "Opening journal line");
      assertNonBlankString(
        line.bookAccountId,
        "Opening journal line book account",
      );
      assertNonBlankString(line.id, "Opening journal line id");
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
      assertNonNegativeSafeInteger(line.amount, "Opening journal line amount");
    }
    assertEntryLinesBalanced(journal.lines, "Opening journal", {
      allowZero: !openingWillBeCompleted,
    });
    for (const line of journal.lines) {
      assertEntryLineMatchesRules(line, "Opening journal");
    }
  }
}
