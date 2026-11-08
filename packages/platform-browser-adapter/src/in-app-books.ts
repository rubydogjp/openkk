import type {
  OpenkkDocumentSink,
  OpenkkDocumentWriteResult,
} from "@rubydogjp/openkk-client-ports";

import {
  listBooks,
  uniqueBookName,
  type BookFileDirectory,
  type BookPlace,
} from "./book-place.js";
import { bookBackups, type BookBackups } from "./book-backup.js";
import { rememberNothing } from "./documents.js";
import { isNotFoundError } from "./file-system-errors.js";
import {
  IN_APP_BOOKS_DIRECTORY,
  type BookRequest,
} from "./in-app-book-protocol.js";
import {
  browserPersistentStorage,
  requestPersistentStorage,
} from "./persistent-storage.js";

export type InAppBookWriter = {
  send(request: BookRequest): Promise<void>;
};

export type InAppBooksDependencies = {
  openDirectory(): Promise<BookFileDirectory>;
  writer: InAppBookWriter;
  requestPersistence(): Promise<unknown>;
  backups: BookBackups;
};

type WorkerAnswer = { id: number; ok: boolean; error: string | null };

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
      return await (
        await directory.getFileHandle(name, { create: false })
      ).getFile();
    } catch (error) {
      if (isNotFoundError(error)) return null;
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

  async function list() {
    return listBooks(await dependencies.openDirectory());
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
        backup: dependencies.backups.sinkFor(name),
        remember: rememberNothing,
      };
    },
    async create(desiredName) {
      void dependencies.requestPersistence();
      const name = uniqueBookName(desiredName, await list());
      return {
        bytes: null,
        sink: createSink(name, null),
        backup: dependencies.backups.sinkFor(name),
        remember: rememberNothing,
      };
    },
    async remove(name) {
      await dependencies.writer.send({ type: "remove", name });
      dependencies.backups.forget(name);
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
    })) as unknown as BookFileDirectory;
  },
  writer: createWorkerBookWriter(
    () =>
      new Worker(new URL("./in-app-books.worker.js", import.meta.url), {
        type: "module",
      }),
  ),
  requestPersistence: () =>
    requestPersistentStorage(browserPersistentStorage()),
  backups: bookBackups,
});
