import {
  CLOSING_GENERATED_LOCAL_ID_PREFIX,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-server-ports";
import { assertEntryInput } from "./entry-validation.js";

export function assertClosingGeneratedEntries(
  entries: unknown,
  period: FiscalPeriodApiRecord,
): void {
  if (!Array.isArray(entries)) {
    throw serverValidationError(
      "Closing entries must be an array",
      "本締め用の自動仕訳データが不正です",
    );
  }
  if (entries.length > MAX_ENTRY_IMPORT_ITEMS) {
    throw serverValidationError(
      `Closing entries exceed the ${MAX_ENTRY_IMPORT_ITEMS.toLocaleString("en-US")} item limit`,
      "本締め用の自動仕訳件数が多すぎます",
    );
  }
  let totalLineCount = 0;
  for (const entry of entries) {
    if (
      typeof entry === "object" &&
      entry != null &&
      Array.isArray(entry.lines)
    ) {
      totalLineCount += entry.lines.length;
      if (
        !Number.isSafeInteger(totalLineCount) ||
        totalLineCount > MAX_ENTRY_IMPORT_LINES
      ) {
        throw serverValidationError(
          `Closing entries exceed the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
          "本締め用の自動仕訳明細数が多すぎます",
        );
      }
    }
  }
  const localIds = new Set<string>();
  for (const entry of entries) {
    if (entry == null || typeof entry !== "object") {
      throw serverValidationError("Closing entry must be an object", null);
    }
    if (
      typeof entry.localId !== "string" ||
      !entry.localId.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)
    ) {
      throw serverValidationError(
        "Closing entries must use a reserved generated localId",
        "本締め用の自動仕訳識別子が不正です",
      );
    }
    if (localIds.has(entry.localId)) {
      throw serverValidationError(
        `Closing entries contain duplicate localId: ${entry.localId}`,
        "本締め用の自動仕訳が重複しています",
      );
    }
    localIds.add(entry.localId);
    assertEntryInput(entry, period);
  }
}
