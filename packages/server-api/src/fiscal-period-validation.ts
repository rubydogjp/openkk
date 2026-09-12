import {
  assertDateRange,
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertOpeningBalanceAccountId,
  assertPositiveInteger,
  assertUniqueAccountIds,
  assertUnitRate,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  serverConflictError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankString,
  assertNonBlankText,
  assertObject,
  assertOptionalBoolean,
  assertString,
  assertText,
} from "./common-validation.js";
import { assertEntryMasterReferences } from "./entry-validation.js";

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
) {
  if (period.archiveStatus === "archived") {
    throw archivedFiscalPeriodError(
      `Archived fiscal period ${period.id} cannot ${operation}`,
    );
  }
}

export function assertPeriodPhase(
  period: FiscalPeriodApiRecord,
  expectedPhase: FiscalPeriodApiRecord["phase"],
  operation: string,
) {
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
  expectedPhases: FiscalPeriodApiRecord["phase"][],
  operation: string,
) {
  assertMutableFiscalPeriod(period, operation);
  if (!expectedPhases.includes(period.phase)) {
    throw serverConflictError(
      `Fiscal period ${period.id} cannot ${operation} from phase ${period.phase}`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
}

export function assertClosingYear(period: FiscalPeriodApiRecord, year: number) {
  assertPositiveInteger(year, "Closing year");
  const expectedYear = Number(period.endDate.slice(0, 4));
  if (year !== expectedYear) {
    throw serverValidationError(
      `Closing year ${year} must match fiscal period end year ${expectedYear}`,
      "締め年度が会計期間の終了年と一致しません",
    );
  }
}

export function assertFiscalPeriodReadyForPreClosing(period: FiscalPeriodApiRecord) {
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
  if (period.opening == null) {
    throw serverConflictError(
      `Fiscal period ${period.id} has completed opening balances without opening data`,
      "期首残高データを保存してから仮締めしてください",
    );
  }
  for (const journal of period.opening.openingJournals) {
    assertEntryLinesBalanced(journal.lines, "Opening journal",{ allowZero: false },);
    assertEntryMasterReferences({
      date: journal.date,
      description: journal.description,
      businessRate: journal.businessRate,
      lines: journal.lines,
      localId: null,
    });
  }
}

export function archivedFiscalPeriodError(messageForDeveloper: string) {
  return serverConflictError(
    messageForDeveloper,
    "圧縮保存済みの会計期間は変更できません",
  );
}

export function assertFiscalPeriodCreateInput(input: FiscalPeriodCreateInput) {
  assertObject(input, "Fiscal period input");
  assertNonBlankText(input.name, "Fiscal period name");
  assertDateRange(input.startDate, input.endDate, "Fiscal period");
}

export function assertNoOverlappingFiscalPeriod(
  input: { startDate: string; endDate: string },
  existingPeriods: FiscalPeriodApiRecord[],
) {
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

function assertOpeningBalancesBalanced(
  lines: ReadonlyArray<{ accountId: string; amount: number }>,
) {
  let assetTotal = 0;
  let liabilityAndEquityTotal = 0;
  for (const line of lines) {
    if (line.accountId.startsWith("a:")) {
      assetTotal += line.amount;
    } else if (line.accountId.startsWith("l:")) {
      liabilityAndEquityTotal += line.amount;
    } else {
      throw serverValidationError(
        `Opening balance accountId must start with a: or l:: ${line.accountId}`,
        "期首残高の勘定科目区分が不正です",
      );
    }
    if (
      !Number.isSafeInteger(assetTotal) ||
      !Number.isSafeInteger(liabilityAndEquityTotal)
    ) {
      throw serverValidationError(
        "Opening balance totals exceed the safe integer range",
        "期首残高の合計金額が大きすぎます",
      );
    }
  }
  if (assetTotal !== liabilityAndEquityTotal) {
    throw serverValidationError(
      `Opening balances must balance: assets ${assetTotal}, liabilities and equity ${liabilityAndEquityTotal}`,
      "期首残高の資産合計と負債・元入金合計を一致させてください",
    );
  }
}

export function assertFiscalPeriodPatchInput(
  current: FiscalPeriodApiRecord,
  patch: FiscalPeriodPatchInput,
) {
  assertObject(patch, "Fiscal period patch");
  if (patch.name != null) {
    assertNonBlankText(patch.name, "Fiscal period name");
  }
  if (patch.startDate != null) {
    assertString(patch.startDate, "Fiscal period start date");
  }
  if (patch.endDate != null) {
    assertString(patch.endDate, "Fiscal period end date");
  }
  assertOptionalBoolean(
    patch.settingsCompleted,
    "Fiscal period settingsCompleted",
  );
  assertOptionalBoolean(
    patch.openingBalancesCompleted,
    "Fiscal period openingBalancesCompleted",
  );
  assertOptionalBoolean(
    patch.documentsReceivedCompleted,
    "Fiscal period documentsReceivedCompleted",
  );
  const startDate =
    patch.startDate == null ? current.startDate : patch.startDate;
  const endDate = patch.endDate == null ? current.endDate : patch.endDate;
  assertDateRange(startDate, endDate, "Fiscal period");
  const openingWillBeCompleted =
    patch.openingBalancesCompleted ?? current.openingBalancesCompleted;

  const opening = patch.opening;
  if (opening != null) {
    if (
      typeof opening !== "object" ||
      opening == null ||
      Array.isArray(opening) ||
      !Array.isArray(opening.openingBalanceLines) ||
      !Array.isArray(opening.openingJournals)
    ) {
      throw serverValidationError("Opening data must contain line arrays", null);
    }
    assertOpeningDataSizeLimits(opening);
    assertNonBlankString(opening.id, "Opening id");
    assertNonBlankString(opening.userId, "Opening user id");
    assertNonBlankString(opening.fiscalPeriodId, "Opening fiscal period id");
    if (current.opening != null && opening.id !== current.opening.id) {
      throw serverValidationError(
        `Opening id ${opening.id} must match existing opening ${current.opening.id}`,
        "期首データの識別子が一致しません",
      );
    }
    if (
      opening.userId !== current.userId ||
      opening.fiscalPeriodId !== current.id
    ) {
      throw serverValidationError(
        "Opening ownership must match the fiscal period",
        "期首データの会計期間情報が一致しません",
      );
    }
    for (const line of opening.openingBalanceLines) {
      if (line == null || typeof line !== "object") {
        throw serverValidationError("Opening balance line must be an object", null);
      }
      assertNonBlankString(line.accountId, "Opening balance account");
      assertOpeningBalanceAccountId(
        line.accountId,
        "Opening balance accountId",
      );
      assertNonBlankString(line.id, "Opening balance line id");
      assertNonNegativeSafeInteger(line.amount, "Opening balance amount");
    }
    assertUniqueAccountIds(
      opening.openingBalanceLines.map((line) => line.accountId),
      "Opening balance lines",
    );
    assertUniqueIds(opening.openingBalanceLines, "Opening balance line ids");
    assertUniqueIds(opening.openingJournals, "Opening journal ids");
    for (const journal of opening.openingJournals) {
      if (
        journal == null ||
        typeof journal !== "object" ||
        !Array.isArray(journal.lines)
      ) {
        throw serverValidationError(
          "Opening journal must contain a lines array",
          null,
        );
      }
      assertNonBlankString(journal.id, "Opening journal id");
      assertText(journal.description, "Opening journal description");
      if (openingWillBeCompleted) {
        assertNonBlankText(
          journal.description,
          "Opening journal description",
        );
      }
      assertIsoDate(journal.date, "Opening journal date");
      if (journal.date < startDate || journal.date > endDate) {
        throw serverValidationError(
          `Opening journal date ${journal.date} must be within fiscal period ${startDate} to ${endDate}`,
          "期首仕訳の日付を会計期間内にしてください",
        );
      }
      assertUnitRate(journal.businessRate, "Opening journal business rate");
      assertUniqueIds(journal.lines, `Opening journal ${journal.id} line ids`);
      for (const line of journal.lines) {
        if (line == null || typeof line !== "object") {
          throw serverValidationError("Opening journal line must be an object", null);
        }
        assertNonBlankString(
          line.bookAccountId,
          "Opening journal line book account",
        );
        assertNonBlankString(line.id, "Opening journal line id");
        assertText(line.partnerName, "Opening journal line partner");
        assertNonNegativeSafeInteger(
          line.amount,
          "Opening journal line amount",
        );
      }
      assertEntryLinesBalanced(journal.lines, "Opening journal", {
        allowZero: !openingWillBeCompleted,
      });
      assertEntryMasterReferences({
        date: journal.date,
        description: journal.description,
        businessRate: journal.businessRate,
        lines: journal.lines,
        localId: null,
      });
    }
  }
  const effectiveOpening = opening ?? current.opening;
  for (const journal of effectiveOpening?.openingJournals ?? []) {
    if (journal.date < startDate || journal.date > endDate) {
      throw serverValidationError(
        `Opening journal date ${journal.date} must be within fiscal period ${startDate} to ${endDate}`,
        "期首仕訳の日付を会計期間内にしてください",
      );
    }
  }
  const mustValidateCompletedOpening =
    patch.openingBalancesCompleted === true ||
    (current.openingBalancesCompleted && opening != null);
  if (mustValidateCompletedOpening && effectiveOpening == null) {
    throw serverValidationError(
      "Completed opening balances require opening data",
      "期首残高を完了するには期首データが必要です",
    );
  }
  if (mustValidateCompletedOpening && effectiveOpening != null) {
    assertOpeningBalancesBalanced(effectiveOpening.openingBalanceLines);
    for (const journal of effectiveOpening.openingJournals) {
      assertNonBlankText(journal.description, "Opening journal description");
      assertEntryLinesBalanced(journal.lines, "Opening journal",{ allowZero: false },);
    }
  }
}

function assertOpeningDataSizeLimits(opening: {
  openingBalanceLines: unknown[];
  openingJournals: unknown[];
}): void {
  if (opening.openingBalanceLines.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Opening balance lines exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      "期首残高の明細件数が多すぎます",
    );
  }
  if (opening.openingJournals.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Opening journals exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      "期首再振替の件数が多すぎます",
    );
  }
  let totalLineCount = 0;
  for (const journal of opening.openingJournals) {
    if (
      typeof journal !== "object" ||
      journal == null ||
      Array.isArray(journal)
    ) {
      continue;
    }
    const lines = (journal as { lines: unknown }).lines;
    if (!Array.isArray(lines)) continue;
    totalLineCount += lines.length;
    if (
      !Number.isSafeInteger(totalLineCount) ||
      totalLineCount > MAX_ENTRY_IMPORT_LINES
    ) {
      throw serverValidationError(
        `Opening journal lines exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
        "期首再振替の明細数が多すぎます",
      );
    }
  }
}

function assertUniqueIds(
  items: ReadonlyArray<unknown>,
  label: string,
): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (typeof item !== "object" || item == null || Array.isArray(item)) {
      throw serverValidationError(`${label} must contain objects`, null);
    }
    const id = (item as { id: unknown }).id;
    assertNonBlankString(id, `${label} item id`);
    if (ids.has(id as string)) {
      throw serverValidationError(
        `${label} contain duplicate id: ${String(id)}`,
        "同じ識別子のデータが重複しています",
      );
    }
    ids.add(id as string);
  }
}

export function assertFiscalPeriodPatchAllowed(
  current: FiscalPeriodApiRecord,
  patch: FiscalPeriodPatchInput,
) {
  assertObject(patch, "Fiscal period patch");
  const changedKeys = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const allowedKeysByPhase: Record<
    FiscalPeriodApiRecord["phase"],
    ReadonlySet<string>
  > = {
    pre_opening: new Set([
      "name",
      "startDate",
      "endDate",
      "settingsCompleted",
      "openingBalancesCompleted",
      "opening",
    ]),
    journalizing: new Set(["openingBalancesCompleted", "opening"]),
    pre_closing: new Set(),
    post_closing: new Set(["documentsReceivedCompleted"]),
  };
  if (current.phase === "pre_closing") {
    throw serverConflictError(
      `Fiscal period ${current.id} cannot be updated from phase pre_closing`,
      "仮締め中の会計期間は変更できません",
    );
  }
  if (
    current.phase === "post_closing" &&
    (changedKeys.length !== 1 ||
      changedKeys[0] !== "documentsReceivedCompleted" ||
      patch.documentsReceivedCompleted !== true)
  ) {
    throw serverConflictError(
      `Fiscal period ${current.id} only allows document receipt completion after closing`,
      "本締め後は書類受領の完了以外を変更できません",
    );
  }
  const disallowedKey = changedKeys.find(
    (key) => !allowedKeysByPhase[current.phase].has(key),
  );
  if (disallowedKey != null) {
    throw serverConflictError(
      `Fiscal period ${current.id} cannot update ${disallowedKey} from phase ${current.phase}`,
      "開始後は会計期間の設定を変更できません",
    );
  }
}
