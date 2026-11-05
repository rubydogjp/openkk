import type {
  OpenkkDocumentSink,
  OpenkkDocumentWriteResult,
} from "@rubydogjp/openkk-client-ports";

import { browserFiles } from "./files.js";

export const OPENKK_DOCUMENT_EXTENSION = ".openkk";
export const OPENKK_DOCUMENT_MIME_TYPE = "application/x-openkk";
export const NEW_OPENKK_DOCUMENT_NAME = `帳簿${OPENKK_DOCUMENT_EXTENSION}`;

const RECENT_DATABASE_NAME = "openkk-documents";
const RECENT_STORE_NAME = "recent";
const RECENT_LIMIT = 8;
const READ_WRITE = { mode: "readwrite" } as const;
const PICKER_TYPES = [
  {
    description: "オープン会計の帳簿",
    accept: { [OPENKK_DOCUMENT_MIME_TYPE]: [OPENKK_DOCUMENT_EXTENSION] },
  },
];

export type BrowserDocumentFileHandle = {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: BufferSource): Promise<void>;
    close(): Promise<void>;
  }>;
  isSameEntry?(other: BrowserDocumentFileHandle): Promise<boolean>;
  queryPermission?(descriptor: typeof READ_WRITE): Promise<PermissionState>;
  requestPermission?(descriptor: typeof READ_WRITE): Promise<PermissionState>;
};

export type BrowserOpenedDocument = {
  bytes: Uint8Array | null;
  sink: OpenkkDocumentSink;
  remember(): Promise<void>;
};

export type BrowserRecentDocument = {
  id: string;
  name: string;
};

type RecentRecord = BrowserRecentDocument & {
  handle: BrowserDocumentFileHandle;
  openedAt: number;
};

type PickerWindow = Window & {
  showOpenFilePicker?(options: unknown): Promise<BrowserDocumentFileHandle[]>;
  showSaveFilePicker?(options: unknown): Promise<BrowserDocumentFileHandle>;
  launchQueue?: {
    setConsumer(
      consumer: (params: { files: BrowserDocumentFileHandle[] }) => void,
    ): void;
  };
};

export class BrowserDocumentPermissionError extends Error {
  constructor(fileName: string) {
    super(`write permission was not granted for ${fileName}`);
    this.name = "BrowserDocumentPermissionError";
  }
}

export function createHandleDocumentSink(
  handle: BrowserDocumentFileHandle,
  knownLastModified: number | null,
): OpenkkDocumentSink {
  let lastModified = knownLastModified;
  return {
    fileName: handle.name,
    saveMode: "auto",
    async write(bytes): Promise<OpenkkDocumentWriteResult> {
      if (lastModified != null) {
        const current = await handle.getFile();
        if (current.lastModified !== lastModified) return "conflict";
      }
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(bytes));
      await writable.close();
      lastModified = (await handle.getFile()).lastModified;
      return "written";
    },
  };
}

export function createDownloadDocumentSink(
  fileName: string,
): OpenkkDocumentSink {
  return {
    fileName,
    saveMode: "download",
    async write(bytes) {
      browserFiles.save(bytes, fileName, OPENKK_DOCUMENT_MIME_TYPE);
      return "written";
    },
  };
}

export const browserDocuments = {
  canSaveDirectly(): boolean {
    const picker = window as PickerWindow;
    return (
      typeof picker.showOpenFilePicker === "function" &&
      typeof picker.showSaveFilePicker === "function"
    );
  },

  async open(): Promise<BrowserOpenedDocument | null> {
    if (!browserDocuments.canSaveDirectly()) return openWithFileInput();
    const handles = await cancellable(() =>
      (window as PickerWindow).showOpenFilePicker!({
        types: PICKER_TYPES,
        excludeAcceptAllOption: false,
        multiple: false,
      }),
    );
    const handle = handles?.[0];
    if (handle == null) return null;
    return openHandle(handle);
  },

  async create(): Promise<BrowserOpenedDocument | null> {
    if (!browserDocuments.canSaveDirectly()) {
      return {
        bytes: null,
        sink: createDownloadDocumentSink(NEW_OPENKK_DOCUMENT_NAME),
        remember: rememberNothing,
      };
    }
    const handle = await cancellable(() =>
      (window as PickerWindow).showSaveFilePicker!({
        suggestedName: NEW_OPENKK_DOCUMENT_NAME,
        types: PICKER_TYPES,
      }),
    );
    if (handle == null) return null;
    await requireWritePermission(handle);
    return {
      bytes: null,
      sink: createHandleDocumentSink(handle, null),
      remember: () => rememberRecent(handle),
    };
  },

  async listRecent(): Promise<BrowserRecentDocument[]> {
    if (!browserDocuments.canSaveDirectly()) return [];
    const records = await readAllRecent().catch((error: unknown) => {
      console.warn("[openkk] recent documents unavailable:", error);
      return [];
    });
    return records
      .sort((left, right) => right.openedAt - left.openedAt)
      .map(({ id, name }) => ({ id, name }));
  },

  async openRecent(id: string): Promise<BrowserOpenedDocument> {
    const record = (await readAllRecent()).find((entry) => entry.id === id);
    if (record == null) throw new Error(`recent document not found: ${id}`);
    return openHandle(record.handle);
  },

  async forgetRecent(id: string): Promise<void> {
    await withRecentStore("readwrite", (store) => store.delete(id));
  },

  onLaunch(consumer: (opened: Promise<BrowserOpenedDocument>) => void): void {
    (window as PickerWindow).launchQueue?.setConsumer(({ files }) => {
      const handle = files[0];
      if (handle != null) consumer(openHandle(handle));
    });
  },
};

async function openHandle(
  handle: BrowserDocumentFileHandle,
): Promise<BrowserOpenedDocument> {
  await requireWritePermission(handle);
  const file = await handle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    bytes,
    sink: createHandleDocumentSink(handle, file.lastModified),
    remember: () => rememberRecent(handle),
  };
}

async function requireWritePermission(
  handle: BrowserDocumentFileHandle,
): Promise<void> {
  if (handle.queryPermission == null || handle.requestPermission == null) {
    return;
  }
  if ((await handle.queryPermission(READ_WRITE)) === "granted") return;
  if ((await handle.requestPermission(READ_WRITE)) === "granted") return;
  throw new BrowserDocumentPermissionError(handle.name);
}

async function cancellable<T>(pick: () => Promise<T>): Promise<T | null> {
  try {
    return await pick();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    throw error;
  }
}

function openWithFileInput(): Promise<BrowserOpenedDocument | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = OPENKK_DOCUMENT_EXTENSION;
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file == null) {
        resolve(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) =>
          resolve({
            bytes: new Uint8Array(buffer),
            sink: createDownloadDocumentSink(file.name),
            remember: rememberNothing,
          }),
        )
        .catch(reject);
    });
    input.click();
  });
}

export async function rememberNothing(): Promise<void> {}

async function rememberRecent(handle: BrowserDocumentFileHandle) {
  try {
    await storeRecent(handle);
  } catch (error) {
    console.warn("[openkk] could not remember recent document:", error);
  }
}

async function storeRecent(handle: BrowserDocumentFileHandle) {
  const records = await readAllRecent();
  const duplicates: RecentRecord[] = [];
  for (const record of records) {
    if (await isSameFile(record.handle, handle)) duplicates.push(record);
  }
  const kept = records
    .filter((record) => !duplicates.includes(record))
    .sort((left, right) => right.openedAt - left.openedAt)
    .slice(0, RECENT_LIMIT - 1);
  const next: RecentRecord = {
    id: duplicates[0]?.id ?? crypto.randomUUID(),
    name: handle.name,
    handle,
    openedAt: Date.now(),
  };
  await withRecentStore("readwrite", (store) => {
    store.clear();
    for (const record of [next, ...kept]) store.put(record);
  });
}

async function isSameFile(
  left: BrowserDocumentFileHandle,
  right: BrowserDocumentFileHandle,
): Promise<boolean> {
  if (left.isSameEntry == null) return false;
  try {
    return await left.isSameEntry(right);
  } catch {
    return false;
  }
}

async function readAllRecent(): Promise<RecentRecord[]> {
  let records: RecentRecord[] = [];
  await withRecentStore("readonly", (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      records = request.result as RecentRecord[];
    };
  });
  return records;
}

function withRecentStore(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(RECENT_DATABASE_NAME, 1);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore(RECENT_STORE_NAME, { keyPath: "id" });
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction(RECENT_STORE_NAME, mode);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
      run(transaction.objectStore(RECENT_STORE_NAME));
    };
  });
}
