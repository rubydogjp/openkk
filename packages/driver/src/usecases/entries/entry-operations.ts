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
  for (const update of operations.updates) {
    await backend.entries.update(fiscalPeriodId, update.id, update.input);
    afterBackendCall();
  }
  if (operations.creates.length > 0) {
    const response = await backend.entries.importMany(
      fiscalPeriodId,
      operations.creates,
    );
    afterBackendCall();
    if (response.importedCount !== operations.creates.length) {
      throw new AppError({
        messageForDeveloper: `entries: the backend added ${response.importedCount} of ${operations.creates.length} journal table entries`,
        messageForUser:
          "足せなかった仕訳があったため、消す仕訳はそのままにしました。もう一度ファイルを取り込んでください",
        originalMessage: null,
        statusCode: null,
        code: null,
      });
    }
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
      "確かめたあとに仕訳が変わったため、何も変えていません。もう一度ファイルを取り込んでください",
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
  const storedNumbers = new Set(
    (await backend.entries.getAll(fiscalPeriodId)).map(
      (entry) => entry.localId ?? entry.id,
    ),
  );
  const incoming = entries.filter(
    (entry) => entry.localId == null || !storedNumbers.has(entry.localId),
  );
  const response =
    incoming.length === 0
      ? { importedCount: 0, entries: [] }
      : await backend.entries.importMany(
          fiscalPeriodId,
          incoming.map((entry) => entryRecordToImportPayload(entry, master)),
        );
  return {
    records: response.entries.map((entry) =>
      storedEntryToRecord(entry, fiscalPeriodId, master),
    ),
    imported: response.importedCount,
    skipped: Math.max(0, entries.length - response.importedCount),
  };
}
