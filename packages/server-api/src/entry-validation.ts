import {
  assertEntryLinesBalanced,
  assertIsoDate,
  assertNonNegativeSafeInteger,
  assertTextFieldLength,
  assertUnitRate,
  CLOSING_GENERATED_LOCAL_ID_PREFIX,
  getDefaultBookAccount,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-server-ports";
import {
  assertNonBlankString,
  assertObject,
  assertString,
} from "./common-validation.js";

export function assertEditableEntryInput(
  input: EntryUpsertInput,
  period: FiscalPeriodApiRecord,
  existing: EntryApiRecord | null,
): void {
  assertEntryInput(input, period);
  if (input.localId?.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)) {
    throw serverValidationError(
      `Entry localId prefix ${CLOSING_GENERATED_LOCAL_ID_PREFIX} is reserved`,
      "この仕訳識別子は本締め用に予約されています",
    );
  }
  if (input.description !== existing?.description) {
    assertTextFieldLength(input.description, "Entry description");
  }
  for (const line of input.lines) {
    if (
      !existing?.lines.some((saved) => saved.partnerName === line.partnerName)
    ) {
      assertTextFieldLength(line.partnerName, "Entry line partner");
    }
    if (
      !existing?.lines.some(
        (saved) => saved.taxCategoryId === line.taxCategoryId,
      )
    ) {
      assertTextFieldLength(line.taxCategoryId, "Entry line tax category");
    }
    if (
      !existing?.lines.some(
        (saved) => saved.businessCategoryId === line.businessCategoryId,
      )
    ) {
      assertTextFieldLength(
        line.businessCategoryId,
        "Entry line business category",
      );
    }
  }
}

export function assertEntryInput(
  input: EntryUpsertInput,
  period: FiscalPeriodApiRecord,
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
  if (input.localId !== null) {
    if (typeof input.localId !== "string") {
      throw serverValidationError(
        "Entry localId must be a string or null",
        null,
      );
    }
    if (input.localId.trim() === "") {
      throw serverValidationError(
        "Entry localId is required when provided",
        null,
      );
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
    assertString(line.partnerName, "Entry line partner");
    assertNonNegativeSafeInteger(line.amount, "Entry line amount");
  }
  assertEntryLinesBalanced(input.lines, "Entry", { allowZero: false });
  assertEntryMasterReferences(input);
}

export function assertEntryMasterReferences(input: EntryUpsertInput): void {
  for (const line of input.lines) {
    if (getDefaultBookAccount(line.bookAccountId) == null) {
      throw serverValidationError(
        `Unknown book account: ${line.bookAccountId}`,
        "存在しない勘定科目が指定されています",
      );
    }
    assertString(line.taxCategoryId, "Entry line tax category");
    assertString(line.businessCategoryId, "Entry line business category");
  }
}
