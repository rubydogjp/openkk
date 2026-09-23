import {
  assertEntryMatchesRules,
  assertTextFieldLength,
  serverValidationError,
  VIRTUAL_ENTRY_LOCAL_ID_PREFIX,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-server-ports";

export function assertEditableEntryInput(
  input: unknown,
  period: FiscalPeriodApiRecord,
  existing: EntryApiRecord | null,
): asserts input is EntryUpsertInput {
  assertEntryMatchesRules(input, period, "Entry");
  if (input.localId?.startsWith(VIRTUAL_ENTRY_LOCAL_ID_PREFIX)) {
    throw serverValidationError(
      `Entry localId prefix ${VIRTUAL_ENTRY_LOCAL_ID_PREFIX} is reserved`,
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
