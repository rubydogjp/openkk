import type {
  OpenkkDocumentBackup,
  OpenkkDocumentBackupSink,
  OpenkkDocumentPort,
  OpenkkDocumentSaveStatus,
  OpenkkDocumentSink,
  OpenkkNextBookInput,
  OpenkkOtherBookPeriod,
} from "@rubydogjp/openkk-client-ports";

export const DOCUMENT_BACKUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export type OpenkkDocumentSession = OpenkkDocumentPort & {
  notifyChanged(): void;
};

export function createOpenkkDocumentSession(options: {
  sink: OpenkkDocumentSink;
  exportBytes: () => Uint8Array;
  onClose: () => void;
  openNextBook: (input: OpenkkNextBookInput) => Promise<void>;
  readOtherBookPeriods: () => Promise<OpenkkOtherBookPeriod[]>;
  backup: OpenkkDocumentBackupSink | null;
  now: () => number;
}): OpenkkDocumentSession {
  const { sink } = options;
  const listeners = new Set<() => void>();
  let status: OpenkkDocumentSaveStatus = "saved";
  let dirty = false;
  let writing: Promise<void> | null = null;
  let changedSinceOpen = false;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const setStatus = (next: OpenkkDocumentSaveStatus) => {
    if (status === next) return;
    status = next;
    notify();
  };

  const backup = createBackup(options.backup);

  function createBackup(
    backupSink: OpenkkDocumentBackupSink | null,
  ): OpenkkDocumentBackup | null {
    if (backupSink == null) return null;
    let lastSavedAt = backupSink.lastSavedAt;
    return {
      getLastSavedAt: () => lastSavedAt,
      isDue: () =>
        changedSinceOpen &&
        options.now() - (lastSavedAt ?? backupSink.firstOpenedAt) >=
          DOCUMENT_BACKUP_INTERVAL_MS,
      async save() {
        const savedAt = options.now();
        const result = await backupSink.write(options.exportBytes(), savedAt);
        if (result === "cancelled") return;
        lastSavedAt = savedAt;
        notify();
      },
    };
  }

  const writeLatest = async (): Promise<void> => {
    while (dirty) {
      dirty = false;
      setStatus("saving");
      let result;
      try {
        result = await sink.write(options.exportBytes());
      } catch (error) {
        dirty = true;
        console.error("[openkk] document save failed:", error);
        setStatus("failed");
        return;
      }
      if (result === "conflict") {
        setStatus("conflict");
        return;
      }
    }
    setStatus("saved");
  };

  const flush = (): Promise<void> => {
    if (writing != null) return writing;
    writing = writeLatest().finally(() => {
      writing = null;
    });
    return writing;
  };

  return {
    fileName: sink.fileName,
    saveMode: sink.saveMode,
    backup,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notifyChanged() {
      if (!changedSinceOpen) {
        changedSinceOpen = true;
        if (backup != null) notify();
      }
      if (status === "conflict") return;
      dirty = true;
      if (sink.saveMode === "download") {
        setStatus("unsaved");
        return;
      }
      void flush();
    },
    async save() {
      if (status === "conflict") return;
      if (sink.saveMode === "download") dirty = true;
      if (!dirty) return writing ?? Promise.resolve();
      await flush();
    },
    async close() {
      if (writing != null) await writing;
      options.onClose();
    },
    openNextBook: options.openNextBook,
    readOtherBookPeriods: options.readOtherBookPeriods,
  };
}
