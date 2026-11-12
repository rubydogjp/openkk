import {
  entryRecordToImportPayload,
  journalTableOperations,
  storedEntryToRecord,
  type EntryLineMaster,
  type EntryRecord,
  type JournalTableChanges,
  type JournalTableMaster,
} from "../../domain/index.js";
import type { OpenkkBackendPort } from "../../ports/index.js";

export type AfterBackendCall = () => void;

export async function applyJournalTableChanges(
  backend: OpenkkBackendPort,
  fiscalPeriodId: string,
  changes: JournalTableChanges,
  master: EntryLineMaster,
  afterBackendCall: AfterBackendCall,
): Promise<void> {
  const operations = journalTableOperations(changes, master);
  for (const id of operations.removeIds) {
    await backend.entries.remove(fiscalPeriodId, id);
    afterBackendCall();
  }
  for (const update of operations.updates) {
    await backend.entries.update(fiscalPeriodId, update.id, update.input);
    afterBackendCall();
  }
  if (operations.creates.length > 0) {
    await backend.entries.importMany(fiscalPeriodId, operations.creates);
    afterBackendCall();
  }
}

export type ImportedEntryRecords = {
  records: EntryRecord[];
  imported: number;
  skipped: number;
};

export async function importEntryRecords(
  backend: OpenkkBackendPort,
  fiscalPeriodId: string,
  entries: ReadonlyArray<EntryRecord>,
  master: JournalTableMaster,
): Promise<ImportedEntryRecords> {
  const response = await backend.entries.importMany(
    fiscalPeriodId,
    entries.map((entry) => entryRecordToImportPayload(entry, master)),
  );
  return {
    records: response.entries.map((entry) =>
      storedEntryToRecord(entry, fiscalPeriodId, master),
    ),
    imported: response.importedCount,
    skipped: Math.max(0, entries.length - response.importedCount),
  };
}
