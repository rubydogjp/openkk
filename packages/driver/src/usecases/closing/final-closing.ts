import {
  buildFinalClosingEntries,
  entryRecordToImportPayload,
  type EntryLineMaster,
  type FiscalPeriodReportInput,
} from "../../domain/index.js";
import type { EntryUpsertInput } from "../../ports/index.js";

export function buildFinalClosingPayload(
  input: FiscalPeriodReportInput,
  master: EntryLineMaster,
): EntryUpsertInput[] {
  return buildFinalClosingEntries(input).map((entry) =>
    entryRecordToImportPayload(entry, master),
  );
}
