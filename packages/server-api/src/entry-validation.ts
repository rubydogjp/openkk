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

const LINE_TEXT_FIELDS = [
  ["partnerName", "Entry line partner"],
  ["taxCategoryId", "Entry line tax category"],
  ["businessCategoryId", "Entry line business category"],
] as const;

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
    for (const [field, label] of LINE_TEXT_FIELDS) {
      if (!existing?.lines.some((saved) => saved[field] === line[field])) {
        assertTextFieldLength(line[field], label);
      }
    }
  }
}
