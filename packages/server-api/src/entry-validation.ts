import {
  assertEntryMatchesRules,
  assertTextFieldLength,
  CLOSING_GENERATED_LOCAL_ID_PREFIX,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-server-ports";
import { assertObject } from "./common-validation.js";

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
  assertEntryMatchesRules(input, period, "Entry");
}
