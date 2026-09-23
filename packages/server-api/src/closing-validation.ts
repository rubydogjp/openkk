import {
  assertEntryCollectionItemLimit,
  assertEntryCollectionLineLimit,
  assertEntryMatchesRules,
  assertUniqueStrings,
  requireObject,
  serverValidationError,
  VIRTUAL_ENTRY_LOCAL_ID_PREFIX,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryUpsertInput,
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-server-ports";

export function assertClosingGeneratedEntries(
  entries: unknown,
  period: FiscalPeriodApiRecord,
): asserts entries is EntryUpsertInput[] {
  if (!Array.isArray(entries)) {
    throw serverValidationError(
      "Closing entries must be an array",
      "本締め用の自動仕訳データが不正です",
    );
  }
  assertEntryCollectionItemLimit(
    entries,
    "Closing entries",
    "本締め用の自動仕訳件数が多すぎます",
  );
  assertEntryCollectionLineLimit(
    entries,
    "Closing entries",
    "本締め用の自動仕訳明細数が多すぎます",
  );
  const localIds = entries.map((item) => {
    const entry = requireObject(item, "Closing entry");
    if (
      typeof entry.localId !== "string" ||
      !entry.localId.startsWith(VIRTUAL_ENTRY_LOCAL_ID_PREFIX)
    ) {
      throw serverValidationError(
        "Closing entries must use a reserved generated localId",
        "本締め用の自動仕訳識別子が不正です",
      );
    }
    assertEntryMatchesRules(entry, period, "Entry");
    return entry.localId;
  });
  assertUniqueStrings(
    localIds,
    "Closing entry localId",
    "本締め用の自動仕訳が重複しています",
  );
}
