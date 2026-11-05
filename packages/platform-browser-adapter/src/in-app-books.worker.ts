import {
  IN_APP_BOOKS_DIRECTORY,
  runBookRequest,
  type BookDirectory,
  type BookRequest,
} from "./in-app-book-protocol.js";

type BookWorkerRequest = BookRequest & { id: number };

type SyncAccessHandle = {
  truncate(size: number): void;
  write(buffer: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
};

type SyncWritableFileHandle = {
  getFile(): Promise<File>;
  createSyncAccessHandle(): Promise<SyncAccessHandle>;
};

type BooksDirectoryHandle = {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<SyncWritableFileHandle>;
  removeEntry(name: string): Promise<void>;
};

type StorageRoot = {
  getDirectory(): Promise<{
    getDirectoryHandle(
      name: string,
      options: { create: boolean },
    ): Promise<BooksDirectoryHandle>;
  }>;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<BookWorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function openBooksDirectory(): Promise<BookDirectory> {
  const root = await (
    navigator.storage as unknown as StorageRoot
  ).getDirectory();
  const directory = await root.getDirectoryHandle(IN_APP_BOOKS_DIRECTORY, {
    create: true,
  });
  return {
    async read(name) {
      try {
        const handle = await directory.getFileHandle(name, { create: false });
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async write(name, bytes) {
      const handle = await directory.getFileHandle(name, { create: true });
      const access = await handle.createSyncAccessHandle();
      try {
        access.truncate(0);
        access.write(bytes, { at: 0 });
        access.flush();
      } finally {
        access.close();
      }
    },
    async remove(name) {
      try {
        await directory.removeEntry(name);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    },
  };
}

async function answer(request: BookWorkerRequest): Promise<void> {
  try {
    await runBookRequest(await openBooksDirectory(), request);
    workerScope.postMessage({ id: request.id, ok: true, error: null });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

let queue: Promise<void> = Promise.resolve();

workerScope.onmessage = (event) => {
  queue = queue.then(() => answer(event.data));
};
