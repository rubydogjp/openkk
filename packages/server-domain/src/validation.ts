import { serverValidationError } from "./app-error";

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
    throw serverValidationError(`${label} is invalid`);
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
    throw serverValidationError(`${label} dates are invalid`);
  }
  if (start.getTime() > end.getTime()) {
    throw serverValidationError(
      `${label} start date must be on or before end date`,
    );
  }
}

export function assertNonNegativeFiniteNumber(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw serverValidationError(
      `${label} must be a non-negative finite number`,
    );
  }
}

export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw serverValidationError(`${label} must be a positive integer`);
  }
}

export function assertUnitRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw serverValidationError(`${label} must be between 0 and 1`);
  }
}

/**
 * 複式簿記の不変条件: 借方金額の合計と貸方金額の合計が一致すること。
 * 事業按分率は借貸の両側へ等しく作用するため、按分前の素の金額で判定する。
 * UI フォームだけでなく永続化境界（作成・更新・取込・アーカイブ取込）でも強制する。
 */
export function assertEntryLinesBalanced(
  lines: ReadonlyArray<{ side: "debit" | "credit"; amount: number }>,
  label: string,
): void {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (line.side === "debit") debitTotal += line.amount;
    else creditTotal += line.amount;
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
