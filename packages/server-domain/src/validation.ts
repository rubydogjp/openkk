import { serverValidationError } from "./app-error.js";

export const MAX_ENTRY_IMPORT_ITEMS = 10_000;
export const MAX_ENTRY_IMPORT_LINES = 100_000;
export const MAX_ENTRY_LINES = 1_000;
export const MAX_FIXED_ASSET_USEFUL_LIFE_YEARS = 100;
export const MAX_TEXT_FIELD_LENGTH = 400;

export type EntryLineBalance = { side: "debit" | "credit"; amount: number };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const record = asRecord(value);
  if (record == null) {
    throw serverValidationError(`${label} must be an object`, null);
  }
  return record;
}

export function assertEntryCollectionItemLimit(
  items: ReadonlyArray<unknown>,
  label: string,
  messageForUser: string | null,
): void {
  if (items.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `${label} exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      messageForUser,
    );
  }
}

export function assertEntryCollectionLineLimit(
  items: ReadonlyArray<unknown>,
  label: string,
  messageForUser: string | null,
): void {
  let totalLineCount = 0;
  for (const item of items) {
    const lines = asRecord(item)?.lines;
    if (!Array.isArray(lines)) continue;
    totalLineCount += lines.length;
    if (
      !Number.isSafeInteger(totalLineCount) ||
      totalLineCount > MAX_ENTRY_IMPORT_LINES
    ) {
      throw serverValidationError(
        `${label} exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
        messageForUser,
      );
    }
  }
}

export function assertUniqueIds(
  items: ReadonlyArray<unknown>,
  label: string,
  messageForUser: string | null,
): void {
  const ids = new Set<string>();
  for (const item of items) {
    const id = requireObject(item, label).id;
    if (typeof id !== "string" || id.trim() === "") {
      throw serverValidationError(`${label} id is required`, messageForUser);
    }
    if (ids.has(id)) {
      throw serverValidationError(
        `${label} has a duplicate id: ${id}`,
        messageForUser,
      );
    }
    ids.add(id);
  }
}

export function assertUniqueStrings(
  values: ReadonlyArray<unknown>,
  label: string,
  messageForUser: string | null,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonBlankString(value, label);
    if (seen.has(value)) {
      throw serverValidationError(
        `${label} has a duplicate value: ${value}`,
        messageForUser,
      );
    }
    seen.add(value);
  }
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function assertNonBlankString(
  value: unknown,
  label: string,
): asserts value is string {
  if (!isNonBlankString(value)) {
    throw serverValidationError(`${label} is required`, null);
  }
}

export function assertTextFieldLength(value: string, label: string): void {
  if (value.length > MAX_TEXT_FIELD_LENGTH) {
    throw serverValidationError(
      `${label} exceeds the ${MAX_TEXT_FIELD_LENGTH.toLocaleString("en-US")} character limit`,
      `入力できる文字数は${MAX_TEXT_FIELD_LENGTH.toLocaleString()}文字までです`,
    );
  }
}

export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function assertIsoDate(
  value: unknown,
  label: string,
): asserts value is string {
  if (parseIsoDate(value) == null) {
    throw serverValidationError(`${label} is invalid`, null);
  }
}

export function assertDateRange(
  startDate: unknown,
  endDate: unknown,
  label: string,
): void {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start == null || end == null) {
    throw serverValidationError(`${label} dates are invalid`, null);
  }
  if (start.getTime() > end.getTime()) {
    throw serverValidationError(
      `${label} start date must be on or before end date`,
      null,
    );
  }
}

export function assertNonNegativeSafeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw serverValidationError(
      `${label} must be a non-negative finite number and a safe integer`,
      null,
    );
  }
}

export function assertPositiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw serverValidationError(`${label} must be a positive integer`, null);
  }
}

export function assertUnitRate(
  value: unknown,
  label: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw serverValidationError(`${label} must be between 0 and 1`, null);
  }
}

export function assertEntryLinesBalanced(
  lines: unknown,
  label: string,
  options: { allowZero: boolean },
): asserts lines is ReadonlyArray<EntryLineBalance> {
  if (!Array.isArray(lines)) {
    throw serverValidationError(`${label} lines must be an array`, null);
  }
  if (lines.length > MAX_ENTRY_LINES) {
    throw serverValidationError(
      `${label} exceeds the ${MAX_ENTRY_LINES.toLocaleString("en-US")} line limit`,
      `1件の仕訳に登録できる明細は${MAX_ENTRY_LINES.toLocaleString()}件までです`,
    );
  }
  let debitTotal = 0;
  let creditTotal = 0;
  let hasDebit = false;
  let hasCredit = false;
  for (const value of lines) {
    const line = requireObject(value, `${label} line`);
    assertNonNegativeSafeInteger(line.amount, `${label} line amount`);
    if (line.side === "debit") {
      hasDebit = true;
      debitTotal += line.amount;
    } else if (line.side === "credit") {
      hasCredit = true;
      creditTotal += line.amount;
    } else {
      throw serverValidationError(`${label} line side is invalid`, null);
    }
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      throw serverValidationError(
        `${label} totals exceed the safe integer range`,
        "仕訳金額の合計が大きすぎます",
      );
    }
  }
  if (
    !hasDebit ||
    !hasCredit ||
    (!options.allowZero && (debitTotal <= 0 || creditTotal <= 0))
  ) {
    throw serverValidationError(
      `${label} must have positive debit and credit lines`,
      "借方と貸方に1件以上の正の金額を入力してください",
    );
  }
  if (debitTotal !== creditTotal) {
    throw serverValidationError(
      `${label} debit total (${debitTotal}) must equal credit total (${creditTotal})`,
      "借方と貸方の合計を一致させてください",
    );
  }
}

export function assertOpeningBalanceAccountId(
  accountId: string,
  label: string,
): void {
  const hasValidPrefix =
    accountId.startsWith("a:") || accountId.startsWith("l:");
  const accountName = accountId.slice(2);
  if (
    !hasValidPrefix ||
    accountName.trim() === "" ||
    accountName !== accountName.trim()
  ) {
    throw serverValidationError(
      `${label} must contain an a: or l: prefix and a non-blank account name: ${accountId}`,
      "期首残高の勘定科目が不正です",
    );
  }
}

export type OpeningRuleJournal = {
  description: string;
  lines: ReadonlyArray<EntryLineBalance>;
};

export function assertCompletedOpening(
  opening: {
    openingBalanceLines: ReadonlyArray<{ accountId: string; amount: number }>;
    openingJournals: ReadonlyArray<OpeningRuleJournal>;
  },
  label: string,
): void {
  for (const journal of opening.openingJournals) {
    if (journal.description.trim() === "") {
      throw serverValidationError(
        `${label} journal description is required`,
        "期首仕訳の摘要を入力してください",
      );
    }
    assertEntryLinesBalanced(journal.lines, `${label} journal`, {
      allowZero: false,
    });
  }
  assertOpeningBalancesBalanced(
    opening.openingBalanceLines,
    `${label} balances`,
  );
}

function assertOpeningBalancesBalanced(
  lines: ReadonlyArray<{ accountId: string; amount: number }>,
  label: string,
): void {
  let assetTotal = 0;
  let liabilityAndEquityTotal = 0;
  for (const line of lines) {
    assertOpeningBalanceAccountId(line.accountId, `${label} accountId`);
    if (line.accountId.startsWith("a:")) {
      assetTotal += line.amount;
    } else {
      liabilityAndEquityTotal += line.amount;
    }
    if (
      !Number.isSafeInteger(assetTotal) ||
      !Number.isSafeInteger(liabilityAndEquityTotal)
    ) {
      throw serverValidationError(
        `${label} totals exceed the safe integer range`,
        "期首残高の合計金額が大きすぎます",
      );
    }
  }
  if (assetTotal !== liabilityAndEquityTotal) {
    throw serverValidationError(
      `${label} must balance: assets ${assetTotal}, liabilities and equity ${liabilityAndEquityTotal}`,
      "期首残高の資産合計と負債・元入金合計を一致させてください",
    );
  }
}
