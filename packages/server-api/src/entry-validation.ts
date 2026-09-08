import {
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertUnitRate,
  CLOSING_GENERATED_LOCAL_ID_PREFIX,
  getDefaultBookAccount,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryUpsertInput,
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankString,
  assertObject,
  assertString,
} from "./common-validation.js";

export function assertEntryInput(
  input: EntryUpsertInput,
  period: FiscalPeriodApiRecord,
  allowClosingGenerated = false,
): void {
  assertObject(input, "Entry input");
  assertNonBlankString(input.description, "Entry description");
  assertIsoDate(input.date, "Entry date");
  if (input.date < period.startDate || input.date > period.endDate) {
    throw serverValidationError(
      `Entry date ${input.date} must be within fiscal period ${period.startDate} to ${period.endDate}`,
      "仕訳日付を会計期間内にしてください",
    );
  }
  if (
    !allowClosingGenerated &&
    typeof input.localId === "string" &&
    input.localId.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)
  ) {
    throw serverValidationError(
      `Entry localId prefix ${CLOSING_GENERATED_LOCAL_ID_PREFIX} is reserved`,
      "この仕訳識別子は本締め用に予約されています",
    );
  }
  if (input.localId !== undefined) {
    if (typeof input.localId !== "string") {
      throw serverValidationError("Entry localId must be a string");
    }
    if (input.localId.trim() === "") {
      throw serverValidationError("Entry localId is required when provided");
    }
  }
  assertUnitRate(input.businessRate, "Entry business rate");
  if (!Array.isArray(input.lines)) {
    throw serverValidationError("Entry lines must be an array");
  }
  for (const line of input.lines) {
    if (line == null || typeof line !== "object") {
      throw serverValidationError("Entry line must be an object");
    }
    assertNonBlankString(line.bookAccountId, "Entry line book account");
    assertString(line.partnerName, "Entry line partner");
    assertNonNegativeSafeInteger(line.amount, "Entry line amount");
  }
  assertEntryLinesBalanced(input.lines, "Entry");
}

export function assertEntryMasterReferences(input: EntryUpsertInput): void {
  for (const line of input.lines) {
    if (getDefaultBookAccount(line.bookAccountId) == null) {
      throw serverValidationError(
        `Unknown book account: ${line.bookAccountId}`,
        "存在しない勘定科目が指定されています",
      );
    }
    if (typeof line.taxCategoryId !== "string") {
      throw serverValidationError("Entry line tax category must be a string");
    }
    if (typeof line.businessCategoryId !== "string") {
      throw serverValidationError(
        "Entry line business category must be a string",
      );
    }
  }
}
