import { serverValidationError } from "./app-error.js";
import { getDefaultBookAccount } from "./master-data.js";
import {
  assertEntryLinesBalanced,
  assertIsoDate,
  assertUnitRate,
} from "./validation.js";

export type EntryRuleLine = {
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryRuleInput = {
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryRuleLine[];
};

export function assertEntryMatchesRules(
  entry: EntryRuleInput,
  period: { startDate: string; endDate: string } | null,
  label: string,
): void {
  if (
    typeof entry.description !== "string" ||
    entry.description.trim() === ""
  ) {
    throw serverValidationError(`${label} description is required`, null);
  }
  assertIsoDate(entry.date, `${label} date`);
  if (
    period != null &&
    (entry.date < period.startDate || entry.date > period.endDate)
  ) {
    throw serverValidationError(
      `${label} date ${entry.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "仕訳日付を会計期間内にしてください",
    );
  }
  if (
    entry.localId !== null &&
    (typeof entry.localId !== "string" || entry.localId.trim() === "")
  ) {
    throw serverValidationError(
      `${label} localId must be a non-blank string or null`,
      null,
    );
  }
  assertUnitRate(entry.businessRate, `${label} business rate`);
  if (!Array.isArray(entry.lines)) {
    throw serverValidationError(`${label} lines must be an array`, null);
  }
  for (const line of entry.lines) {
    assertEntryLineMatchesRules(line, label);
  }
  assertEntryLinesBalanced(entry.lines, label, { allowZero: false });
}

export function assertEntryLineMatchesRules(
  line: EntryRuleLine,
  label: string,
): void {
  if (line == null || typeof line !== "object") {
    throw serverValidationError(`${label} line must be an object`, null);
  }
  if (
    typeof line.bookAccountId !== "string" ||
    line.bookAccountId.trim() === ""
  ) {
    throw serverValidationError(`${label} line book account is required`, null);
  }
  if (getDefaultBookAccount(line.bookAccountId) == null) {
    throw serverValidationError(
      `${label} line references unknown book account: ${line.bookAccountId}`,
      "存在しない勘定科目が指定されています",
    );
  }
  assertLineText(line.partnerName, `${label} line partner`);
  assertLineText(line.taxCategoryId, `${label} line tax category`);
  assertLineText(line.businessCategoryId, `${label} line business category`);
}

function assertLineText(value: unknown, label: string): void {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
}
