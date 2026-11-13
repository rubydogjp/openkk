import {
  AppError,
  entryRecordToImportPayload,
  isMaterializedVirtualEntry,
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
  const storedEntries = await backend.entries.getAll(fiscalPeriodId);
  afterBackendCall();
  assertChangesMatchStoredEntries(changes, storedEntries);
  const operations = journalTableOperations(changes, master);
  if (operations.creates.length > 0) {
    await backend.entries.importMany(fiscalPeriodId, operations.creates);
    afterBackendCall();
  }
  for (const update of operations.updates) {
    await backend.entries.update(fiscalPeriodId, update.id, update.input);
    afterBackendCall();
  }
  for (const id of operations.removeIds) {
    await backend.entries.remove(fiscalPeriodId, id);
    afterBackendCall();
  }
}

function assertChangesMatchStoredEntries(
  changes: JournalTableChanges,
  storedEntries: ReadonlyArray<{ id: string; localId: string | null }>,
): void {
  const storedIds = new Set(
    storedEntries
      .filter((entry) => !isMaterializedVirtualEntry(entry))
      .map((entry) => entry.id),
  );
  const comparedIds = [
    ...changes.changed.map(({ current }) => current.id),
    ...changes.removed.map((entry) => entry.id),
  ];
  const comparedCount = comparedIds.length + changes.unchangedCount;
  if (
    comparedCount === storedIds.size &&
    comparedIds.every((id) => storedIds.has(id))
  ) {
    return;
  }
  throw new AppError({
    messageForDeveloper:
      "entries: stored entries differ from the ones the journal table changes were compared with",
    messageForUser:
      "確かめたあとに仕訳が変わったため、何も反映しませんでした。もう一度ファイルを取り込んでください",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
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
