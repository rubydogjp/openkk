import { isBookFileName, OPENKK_BOOK_EXTENSION } from "./book-file-format.js";
import { isNotFoundError } from "./file-system-errors.js";
import {
  IN_APP_BOOKS_DIRECTORY,
  PENDING_COPY_SUFFIX,
  READY_MARK_SUFFIX,
  type BookRequest,
} from "./in-app-book-protocol.js";
import {
  browserPersistentStorage,
  requestPersistentStorage,
  type PersistentStorageOutcome,
} from "./persistent-storage.js";

export type InAppBookStore = {
  list(): Promise<string[]>;
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
};

export type InAppBookDirectory = {
  values(): AsyncIterable<{ kind: string; name: string }>;
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{ getFile(): Promise<File> }>;
};

export type InAppBookWriter = {
  send(request: BookRequest): Promise<void>;
};

export type InAppBookStoreDependencies = {
  openDirectory(): Promise<InAppBookDirectory>;
  writer: InAppBookWriter;
};

type WorkerAnswer = { id: number; ok: boolean; error: string | null };

type DirectoryScan = { books: string[]; interrupted: string[] };

function interruptedBookName(fileName: string): string | null {
  for (const suffix of [PENDING_COPY_SUFFIX, READY_MARK_SUFFIX]) {
    if (!fileName.endsWith(suffix)) continue;
    const bookName = fileName.slice(0, -suffix.length);
    if (isBookFileName(bookName)) return bookName;
  }
  return null;
}

export function createInAppBookStore(
  dependencies: InAppBookStoreDependencies,
): InAppBookStore {
  async function scan(): Promise<DirectoryScan> {
    const directory = await dependencies.openDirectory();
    const books: string[] = [];
    const interrupted = new Set<string>();
    for await (const entry of directory.values()) {
      if (entry.kind !== "file") continue;
      if (isBookFileName(entry.name)) {
        books.push(entry.name);
        continue;
      }
      const bookName = interruptedBookName(entry.name);
      if (bookName != null) interrupted.add(bookName);
    }
    return { books: books.sort(), interrupted: [...interrupted] };
  }

  async function readBytes(name: string): Promise<Uint8Array | null> {
    const directory = await dependencies.openDirectory();
    try {
      const file = await (
        await directory.getFileHandle(name, { create: false })
      ).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  return {
    async list() {
      const first = await scan();
      if (first.interrupted.length === 0) return first.books;
      for (const name of first.interrupted) {
        await dependencies.writer.send({ type: "recover", name });
      }
      return (await scan()).books;
    },
    async read(name) {
      await dependencies.writer.send({ type: "recover", name });
      return readBytes(name);
    },
    async write(name, bytes) {
      await dependencies.writer.send({ type: "write", name, bytes });
    },
    async remove(name) {
      await dependencies.writer.send({ type: "remove", name });
    },
  };
}

export function createWorkerBookWriter(
  createWorker: () => Worker,
): InAppBookWriter {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  function failAll(reason: string): void {
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(new Error(reason));
    }
    worker = null;
  }

  function ensureWorker(): Worker {
    if (worker != null) return worker;
    const created = createWorker();
    created.onmessage = (event: MessageEvent<WorkerAnswer>) => {
      const entry = pending.get(event.data.id);
      if (entry == null) return;
      pending.delete(event.data.id);
      if (event.data.ok) entry.resolve();
      else entry.reject(new Error(event.data.error ?? "in-app book failed"));
    };
    created.onerror = (event) => {
      failAll(event.message || "in-app book worker crashed");
    };
    worker = created;
    return created;
  }

  return {
    send(request) {
      const id = nextId++;
      return new Promise<void>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ensureWorker().postMessage({ id, ...request });
      });
    },
  };
}

export function canUseInAppBooks(): boolean {
  return (
    typeof navigator === "object" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof Worker === "function"
  );
}

export function newInAppBookName(): string {
  return `${crypto.randomUUID()}${OPENKK_BOOK_EXTENSION}`;
}

export const inAppBookStore = createInAppBookStore({
  async openDirectory() {
    const root = await navigator.storage.getDirectory();
    return (await root.getDirectoryHandle(IN_APP_BOOKS_DIRECTORY, {
      create: true,
    })) as unknown as InAppBookDirectory;
  },
  writer: createWorkerBookWriter(
    () =>
      new Worker(new URL("./in-app-books.worker.js", import.meta.url), {
        type: "module",
      }),
  ),
});

export function requestBrowserPersistentStorage(): Promise<PersistentStorageOutcome> {
  return requestPersistentStorage(browserPersistentStorage());
}
