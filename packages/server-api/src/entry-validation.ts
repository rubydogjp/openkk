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
  assertNonBlankText,
  assertObject,
  assertText,
} from "./common-validation.js";

export function assertEntryInput(
  input: EntryUpsertInput,
  period: FiscalPeriodApiRecord,
  allowClosingGenerated: boolean,
): void {
  assertObject(input, "Entry input");
  assertNonBlankText(input.description, "Entry description");
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
  if (input.localId !== null) {
    if (typeof input.localId !== "string") {
      throw serverValidationError("Entry localId must be a string or null", null);
    }
    if (input.localId.trim() === "") {
      throw serverValidationError("Entry localId is required when provided", null);
    }
  }
  assertUnitRate(input.businessRate, "Entry business rate");
  if (!Array.isArray(input.lines)) {
    throw serverValidationError("Entry lines must be an array", null);
  }
  for (const line of input.lines) {
    if (line == null || typeof line !== "object") {
      throw serverValidationError("Entry line must be an object", null);
    }
    assertNonBlankString(line.bookAccountId, "Entry line book account");
    assertText(line.partnerName, "Entry line partner");
    assertNonNegativeSafeInteger(line.amount, "Entry line amount");
  }
  assertEntryLinesBalanced(input.lines, "Entry", { allowZero: false });
}

export function assertEntryMasterReferences(input: EntryUpsertInput): void {
  for (const line of input.lines) {
    if (getDefaultBookAccount(line.bookAccountId) == null) {
      throw serverValidationError(
        `Unknown book account: ${line.bookAccountId}`,
        "存在しない勘定科目が指定されています",
      );
    }
    assertText(line.taxCategoryId, "Entry line tax category");
    assertText(line.businessCategoryId, "Entry line business category");
  }
}
