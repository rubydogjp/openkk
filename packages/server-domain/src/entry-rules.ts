import { serverValidationError } from "./app-error.js";
import { getDefaultBookAccount } from "./master-data.js";
import {
  assertEntryLinesBalanced,
  assertIsoDate,
  assertUnitRate,
  requireObject,
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
  entry: unknown,
  period: { startDate: string; endDate: string } | null,
  label: string,
): asserts entry is EntryRuleInput {
  const value = requireObject(entry, label);
  if (
    typeof value.description !== "string" ||
    value.description.trim() === ""
  ) {
    throw serverValidationError(`${label} description is required`, null);
  }
  assertIsoDate(value.date, `${label} date`);
  if (
    period != null &&
    (value.date < period.startDate || value.date > period.endDate)
  ) {
    throw serverValidationError(
      `${label} date ${value.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "仕訳日付を会計期間内にしてください",
    );
  }
  if (
    value.localId !== null &&
    (typeof value.localId !== "string" || value.localId.trim() === "")
  ) {
    throw serverValidationError(
      `${label} localId must be a non-blank string or null`,
      null,
    );
  }
  assertUnitRate(value.businessRate, `${label} business rate`);
  if (!Array.isArray(value.lines)) {
    throw serverValidationError(`${label} lines must be an array`, null);
  }
  for (const line of value.lines) {
    assertEntryLineMatchesRules(line, label);
  }
  assertEntryLinesBalanced(value.lines, label, { allowZero: false });
}

export function assertEntryLineMatchesRules(
  line: unknown,
  label: string,
): asserts line is EntryRuleLine {
  const value = requireObject(line, `${label} line`);
  if (
    typeof value.bookAccountId !== "string" ||
    value.bookAccountId.trim() === ""
  ) {
    throw serverValidationError(`${label} line book account is required`, null);
  }
  if (getDefaultBookAccount(value.bookAccountId) == null) {
    throw serverValidationError(
      `${label} line references unknown book account: ${value.bookAccountId}`,
      "存在しない勘定科目が指定されています",
    );
  }
  assertLineText(value.partnerName, `${label} line partner`);
  assertLineText(value.taxCategoryId, `${label} line tax category`);
  assertLineText(value.businessCategoryId, `${label} line business category`);
}

function assertLineText(value: unknown, label: string): void {
  if (typeof value !== "string") {
    throw serverValidationError(`${label} must be a string`, null);
  }
}
