import {
  assertEntryMatchesRules,
  assertEntryNumberLength,
  assertTextFieldLength,
  engineValidationError,
  VIRTUAL_ENTRY_LOCAL_ID_PREFIX,
} from "@rubydogjp/openkk-engine";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
} from "./contract.js";

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
    throw engineValidationError(
      `Entry localId prefix ${VIRTUAL_ENTRY_LOCAL_ID_PREFIX} is reserved`,
      "この仕訳識別子は本締め用に予約されています",
    );
  }
  if (input.localId !== existing?.localId) {
    assertEntryNumberLength(input.localId, "Entry localId");
  }
  assertLinesShareEntryValues(input.lines);
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

function assertLinesShareEntryValues(lines: EntryUpsertInput["lines"]): void {
  const [first, ...others] = lines;
  if (first == null) return;
  const differs = others.some((line) =>
    LINE_TEXT_FIELDS.some(([field]) => line[field] !== first[field]),
  );
  if (differs) {
    throw engineValidationError(
      "Entry lines must share one partner, tax category and business category",
      "取引先・税区分・事業区分は、1 つの仕訳で同じにしてください。違うときは別の仕訳に分けてください",
    );
  }
}
