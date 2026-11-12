import { engineValidationError } from "./app-error.js";
import { assertEntryLineMatchesRules } from "./entry-rules.js";
import type { FiscalPeriodOpening, OpeningBalanceLine } from "./models.js";
import {
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonBlankString,
  assertNonNegativeSafeInteger,
  assertUniqueIds,
  assertUniqueStrings,
  assertUnitRate,
  requireObject,
} from "./validation.js";

const DUPLICATE_ID_MESSAGE = "同じ識別子のデータが重複しています";

export function assertOpeningMatchesRules(
  opening: unknown,
  period: { startDate: string; endDate: string } | null,
  label: string,
  options: { completed: boolean },
): asserts opening is FiscalPeriodOpening {
  const value = requireObject(opening, label);
  const { balanceLines, journals } = value;
  if (!Array.isArray(balanceLines) || !Array.isArray(journals)) {
    throw engineValidationError(`${label} must contain line arrays`, null);
  }
  assertEntryCollectionItemLimit(
    balanceLines,
    `${label} balance lines`,
    "期首残高の明細件数が多すぎます",
  );
  assertEntryCollectionItemLimit(
    journals,
    `${label} journals`,
    "期首再振替の件数が多すぎます",
  );
  assertEntryCollectionLineLimit(
    journals,
    `${label} journal lines`,
    "期首再振替の明細数が多すぎます",
  );
  for (const line of balanceLines) {
    assertOpeningBalanceLine(line, `${label} balance line`);
  }
  assertUniqueIds(balanceLines, `${label} balance line`, DUPLICATE_ID_MESSAGE);
  assertUniqueStrings(
    balanceLines.map((line) => line.accountId),
    `${label} balance accountId`,
    "同じ勘定科目の期首残高が重複しています",
  );
  for (const journal of journals) {
    assertOpeningJournal(journal, period, `${label} journal`, options);
  }
  assertUniqueIds(journals, `${label} journal`, DUPLICATE_ID_MESSAGE);
  if (options.completed) {
    assertOpeningBalancesBalanced(balanceLines, `${label} balances`);
  }
}

function assertOpeningBalanceLine(
  line: unknown,
  label: string,
): asserts line is OpeningBalanceLine {
  const value = requireObject(line, label);
  assertNonBlankString(value.id, `${label} id`);
  assertNonBlankString(value.accountId, `${label} accountId`);
  assertOpeningBalanceAccountId(value.accountId, `${label} accountId`);
  assertNonNegativeSafeInteger(value.amount, `${label} amount`);
}

function assertOpeningBalanceAccountId(accountId: string, label: string): void {
  const hasValidPrefix =
    accountId.startsWith("a:") || accountId.startsWith("l:");
  const accountName = accountId.slice(2);
  if (
    !hasValidPrefix ||
    accountName.trim() === "" ||
    accountName !== accountName.trim()
  ) {
    throw engineValidationError(
      `${label} must contain an a: or l: prefix and a non-blank account name: ${accountId}`,
      "期首残高の勘定科目が不正です",
    );
  }
}

function assertOpeningJournal(
  journal: unknown,
  period: { startDate: string; endDate: string } | null,
  label: string,
  options: { completed: boolean },
): void {
  const value = requireObject(journal, label);
  assertNonBlankString(value.id, `${label} id`);
  assertIsoDate(value.date, `${label} date`);
  if (
    period != null &&
    (value.date < period.startDate || value.date > period.endDate)
  ) {
    throw engineValidationError(
      `${label} date ${value.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "期首仕訳の日付を会計期間内にしてください",
    );
  }
  if (typeof value.description !== "string") {
    throw engineValidationError(`${label} description must be a string`, null);
  }
  if (options.completed && value.description.trim() === "") {
    throw engineValidationError(
      `${label} description is required`,
      "期首仕訳の摘要を入力してください",
    );
  }
  assertUnitRate(value.businessRate, `${label} business rate`);
  if (!Array.isArray(value.lines)) {
    throw engineValidationError(`${label} lines must be an array`, null);
  }
  for (const line of value.lines) {
    assertNonBlankString(
      requireObject(line, `${label} line`).id,
      `${label} line id`,
    );
    assertEntryLineMatchesRules(line, label);
  }
  assertUniqueIds(
    value.lines,
    `${label} ${value.id} line`,
    DUPLICATE_ID_MESSAGE,
  );
  assertEntryLinesBalanced(value.lines, label, {
    allowZero: !options.completed,
  });
}

function assertOpeningBalancesBalanced(
  lines: ReadonlyArray<OpeningBalanceLine>,
  label: string,
): void {
  let assetTotal = 0;
  let liabilityAndEquityTotal = 0;
  for (const line of lines) {
    if (line.accountId.startsWith("a:")) {
      assetTotal += line.amount;
    } else {
      liabilityAndEquityTotal += line.amount;
    }
    if (
      !Number.isSafeInteger(assetTotal) ||
      !Number.isSafeInteger(liabilityAndEquityTotal)
    ) {
      throw engineValidationError(
        `${label} totals exceed the safe integer range`,
        "期首残高の合計金額が大きすぎます",
      );
    }
  }
  if (assetTotal !== liabilityAndEquityTotal) {
    throw engineValidationError(
      `${label} must balance: assets ${assetTotal}, liabilities and equity ${liabilityAndEquityTotal}`,
      "期首残高の資産合計と負債・元入金合計を一致させてください",
    );
  }
}
