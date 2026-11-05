import type {
  OpenkkDocumentSink,
  OpenkkDocumentWriteResult,
} from "@rubydogjp/openkk-client-ports";

import {
  newestFirst,
  uniqueBookName,
  type BookPlace,
  type StoredBook,
} from "./book-place.js";
import {
  IN_APP_BOOKS_DIRECTORY,
  isInAppBookName,
  type BookRequest,
} from "./in-app-book-protocol.js";
import {
  browserPersistentStorage,
  requestPersistentStorage,
} from "./persistent-storage.js";

export type InAppBookWriter = {
  send(request: BookRequest): Promise<void>;
};

export type InAppBooksDirectory = {
  values(): AsyncIterable<{ kind: string; name: string }>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
};

export type InAppBooksDependencies = {
  openDirectory(): Promise<InAppBooksDirectory>;
  writer: InAppBookWriter;
  requestPersistence(): Promise<unknown>;
};

type WorkerAnswer = { id: number; ok: boolean; error: string | null };

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function rememberNothing(): Promise<void> {}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function createInAppBooks(
  dependencies: InAppBooksDependencies,
): BookPlace {
  async function readFile(name: string): Promise<File | null> {
    const directory = await dependencies.openDirectory();
    try {
      return await (await directory.getFileHandle(name)).getFile();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function readBytes(name: string): Promise<Uint8Array | null> {
    const file = await readFile(name);
    return file == null ? null : new Uint8Array(await file.arrayBuffer());
  }

  function createSink(
    name: string,
    knownBytes: Uint8Array | null,
  ): OpenkkDocumentSink {
    let lastSeen = knownBytes;
    return {
      fileName: name,
      saveMode: "auto",
      async write(bytes): Promise<OpenkkDocumentWriteResult> {
        const current = await readBytes(name);
        if (
          current != null &&
          (lastSeen == null || !sameBytes(current, lastSeen))
        ) {
          return "conflict";
        }
        await dependencies.writer.send({ type: "write", name, bytes });
        lastSeen = bytes.slice();
        return "written";
      },
    };
  }

  async function list(): Promise<StoredBook[]> {
    const directory = await dependencies.openDirectory();
    const books: StoredBook[] = [];
    for await (const entry of directory.values()) {
      if (entry.kind !== "file" || !isInAppBookName(entry.name)) continue;
      const file = await (await directory.getFileHandle(entry.name)).getFile();
      books.push({
        name: entry.name,
        size: file.size,
        lastModified: file.lastModified,
      });
    }
    return newestFirst(books);
  }

  return {
    list,
    async open(name) {
      void dependencies.requestPersistence();
      await dependencies.writer.send({ type: "recover", name });
      const bytes = await readBytes(name);
      if (bytes == null) throw new Error(`in-app book not found: ${name}`);
      return {
        bytes,
        sink: createSink(name, bytes),
        remember: rememberNothing,
      };
    },
    async create(desiredName) {
      void dependencies.requestPersistence();
      return {
        bytes: null,
        sink: createSink(
          uniqueBookName(
            desiredName,
            new Set((await list()).map((book) => book.name)),
          ),
          null,
        ),
        remember: rememberNothing,
      };
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

export const inAppBooks = createInAppBooks({
  async openDirectory() {
    const root = await navigator.storage.getDirectory();
    return (await root.getDirectoryHandle(IN_APP_BOOKS_DIRECTORY, {
      create: true,
    })) as unknown as InAppBooksDirectory;
  },
  writer: createWorkerBookWriter(
    () =>
      new Worker(new URL("./in-app-books.worker.js", import.meta.url), {
        type: "module",
      }),
  ),
  requestPersistence: () =>
    requestPersistentStorage(browserPersistentStorage()),
});
