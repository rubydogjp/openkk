import type {
  OpenkkDocumentSink,
  OpenkkDocumentWriteResult,
} from "@rubydogjp/openkk-client-ports";

import { listBooks, uniqueBookName, type BookPlace } from "./book-place.js";
import {
  BrowserDocumentPermissionError,
  createHandleDocumentSink,
  rememberNothing,
  type BrowserDocumentFileHandle,
} from "./documents.js";
import { isNotFoundError } from "./file-system-errors.js";

const FOLDER_DATABASE_NAME = "openkk-book-folder";
const FOLDER_STORE_NAME = "folder";
const CURRENT_FOLDER_KEY = "current";
const FOLDER_PICKER_ID = "openkk-books";
const READ_WRITE = { mode: "readwrite" } as const;

export type FolderPermission = "granted" | "prompt" | "denied";

export type BookFolderHandle = {
  readonly name: string;
  values(): AsyncIterable<{ kind: string; name: string }>;
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<BrowserDocumentFileHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission(descriptor: typeof READ_WRITE): Promise<PermissionState>;
  requestPermission(descriptor: typeof READ_WRITE): Promise<PermissionState>;
};

export type FolderBooksDependencies = {
  pickFolder(): Promise<BookFolderHandle | null>;
  loadFolder(): Promise<BookFolderHandle | null>;
  saveFolder(folder: BookFolderHandle | null): Promise<void>;
};

export type FolderBooks = BookPlace & {
  folderName(): Promise<string | null>;
  permission(): Promise<FolderPermission | null>;
  chooseFolder(): Promise<string | null>;
  requestAccess(): Promise<FolderPermission>;
  forgetFolder(): Promise<void>;
};

export class BookFolderMissingError extends Error {
  constructor() {
    super("no folder has been chosen for the books");
    this.name = "BookFolderMissingError";
  }
}

async function findFile(
  folder: BookFolderHandle,
  name: string,
): Promise<BrowserDocumentFileHandle | null> {
  try {
    return await folder.getFileHandle(name, { create: false });
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function createFileOnFirstSaveSink(
  folder: BookFolderHandle,
  name: string,
): OpenkkDocumentSink {
  let sink: OpenkkDocumentSink | null = null;
  return {
    fileName: name,
    saveMode: "auto",
    async write(bytes): Promise<OpenkkDocumentWriteResult> {
      if (sink == null) {
        if ((await findFile(folder, name)) != null) return "conflict";
        sink = createHandleDocumentSink(
          await folder.getFileHandle(name, { create: true }),
          null,
        );
      }
      return sink.write(bytes);
    },
  };
}

export function createFolderBooks(
  dependencies: FolderBooksDependencies,
): FolderBooks {
  async function requireFolder(): Promise<BookFolderHandle> {
    const folder = await dependencies.loadFolder();
    if (folder == null) throw new BookFolderMissingError();
    if ((await folder.queryPermission(READ_WRITE)) !== "granted") {
      throw new BrowserDocumentPermissionError(folder.name);
    }
    return folder;
  }

  async function list() {
    return listBooks(await requireFolder());
  }

  return {
    list,
    async open(name) {
      const folder = await requireFolder();
      const handle = await folder.getFileHandle(name, { create: false });
      const file = await handle.getFile();
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        sink: createHandleDocumentSink(handle, file.lastModified),
        remember: rememberNothing,
      };
    },
    async create(desiredName) {
      const folder = await requireFolder();
      return {
        bytes: null,
        sink: createFileOnFirstSaveSink(
          folder,
          uniqueBookName(desiredName, await list()),
        ),
        remember: rememberNothing,
      };
    },
    async remove(name) {
      await (await requireFolder()).removeEntry(name);
    },
    async folderName() {
      return (await dependencies.loadFolder())?.name ?? null;
    },
    async permission() {
      const folder = await dependencies.loadFolder();
      return folder == null ? null : folder.queryPermission(READ_WRITE);
    },
    async chooseFolder() {
      const folder = await dependencies.pickFolder();
      if (folder == null) return null;
      await dependencies.saveFolder(folder);
      return folder.name;
    },
    async requestAccess() {
      const folder = await dependencies.loadFolder();
      if (folder == null) throw new BookFolderMissingError();
      return folder.requestPermission(READ_WRITE);
    },
    async forgetFolder() {
      await dependencies.saveFolder(null);
    },
  };
}

type DirectoryPicker = (options: {
  id: string;
  mode: "readwrite";
}) => Promise<BookFolderHandle>;

function browserDirectoryPicker(): DirectoryPicker | null {
  if (typeof window !== "object") return null;
  const picker: unknown = Reflect.get(window, "showDirectoryPicker");
  return typeof picker === "function"
    ? (picker.bind(window) as DirectoryPicker)
    : null;
}

export function canUseFolderBooks(): boolean {
  return browserDirectoryPicker() != null;
}

function withFolderStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(FOLDER_DATABASE_NAME, 1);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore(FOLDER_STORE_NAME);
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction(FOLDER_STORE_NAME, mode);
      const request = run(transaction.objectStore(FOLDER_STORE_NAME));
      transaction.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

export const folderBooks = createFolderBooks({
  async pickFolder() {
    const picker = browserDirectoryPicker();
    if (picker == null) return null;
    try {
      return await picker({ id: FOLDER_PICKER_ID, mode: "readwrite" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  },
  async loadFolder() {
    const stored = await withFolderStore<unknown>("readonly", (store) =>
      store.get(CURRENT_FOLDER_KEY),
    );
    return (stored as BookFolderHandle | null) ?? null;
  },
  async saveFolder(folder) {
    if (folder == null) {
      await withFolderStore("readwrite", (store) =>
        store.delete(CURRENT_FOLDER_KEY),
      );
      return;
    }
    await withFolderStore("readwrite", (store) =>
      store.put(folder, CURRENT_FOLDER_KEY),
    );
  },
});
