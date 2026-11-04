import type {
  OpenkkDocumentPort,
  OpenkkDocumentSaveStatus,
  OpenkkDocumentSink,
} from "@rubydogjp/openkk-client-ports";

export type OpenkkDocumentSession = OpenkkDocumentPort & {
  notifyChanged(): void;
};

export function createOpenkkDocumentSession(options: {
  sink: OpenkkDocumentSink;
  exportBytes: () => Uint8Array;
  onClose: () => void;
}): OpenkkDocumentSession {
  const { sink } = options;
  const listeners = new Set<() => void>();
  let status: OpenkkDocumentSaveStatus = "saved";
  let dirty = false;
  let writing: Promise<void> | null = null;

  const setStatus = (next: OpenkkDocumentSaveStatus) => {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  };

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
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notifyChanged() {
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
  };
}
