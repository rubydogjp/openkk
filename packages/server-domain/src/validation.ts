import { serverValidationError } from "./app-error.js";

export const MAX_ENTRY_IMPORT_ITEMS = 10_000;
export const MAX_ENTRY_IMPORT_LINES = 100_000;
export const MAX_ENTRY_LINES = 1_000;
export const MAX_FIXED_ASSET_USEFUL_LIFE_YEARS = 100;
export const MAX_TEXT_FIELD_LENGTH = 400;

export function assertTextFieldLength(value: string, label: string): void {
  if (value.length > MAX_TEXT_FIELD_LENGTH) {
    throw serverValidationError(
      `${label} exceeds the ${MAX_TEXT_FIELD_LENGTH.toLocaleString("en-US")} character limit`,
      `入力できる文字数は${MAX_TEXT_FIELD_LENGTH.toLocaleString()}文字までです`,
    );
  }
}

export function parseIsoDate(value: string): Date | null {
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

export function assertIsoDate(value: string, label: string): void {
  if (parseIsoDate(value) == null) {
    throw serverValidationError(`${label} is invalid`, null);
  }
}

export function assertDateRange(
  startDate: string,
  endDate: string,
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
  value: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw serverValidationError(
      `${label} must be a non-negative finite number and a safe integer`,
      null,
    );
  }
}

export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw serverValidationError(`${label} must be a positive integer`, null);
  }
}

export function assertUnitRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw serverValidationError(`${label} must be between 0 and 1`, null);
  }
}

export function assertEntryLinesBalanced(
  lines: ReadonlyArray<{ side: "debit" | "credit"; amount: number }>,
  label: string,
  options: { allowZero: boolean },
): void {
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
  for (const line of lines) {
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
  if (Math.abs(debitTotal - creditTotal) > 1e-6) {
    throw serverValidationError(
      `${label} debit total (${debitTotal}) must equal credit total (${creditTotal})`,
      "借方と貸方の合計を一致させてください",
    );
  }
}

export function assertUniqueAccountIds(
  accountIds: ReadonlyArray<string>,
  label: string,
): void {
  const seen = new Set<string>();
  for (const accountId of accountIds) {
    if (seen.has(accountId)) {
      throw serverValidationError(
        `${label} has a duplicate accountId: ${accountId}`,
        "同じ勘定科目の期首残高が重複しています",
      );
    }
    seen.add(accountId);
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
