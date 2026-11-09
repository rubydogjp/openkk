import { describe, expect, it, vi } from "vitest";

import {
  fakeLockManager,
  settleLocks,
} from "../test-support/fake-lock-manager.js";
import { BookInUseError, createBookLocks } from "./book-lock.js";
import { createBookBackups } from "./book-backup.js";
import { type BookFileDirectory } from "./book-place.js";
import {
  PENDING_COPY_SUFFIX,
  READY_MARK_SUFFIX,
  runBookRequest,
  type BookDirectory,
  type BookRequest,
} from "./in-app-book-protocol.js";
import { createInAppBooks, createWorkerBookWriter } from "./in-app-books.js";

type StoredFile = { bytes: Uint8Array; lastModified: number };

function fakeInAppStorage() {
  const files = new Map<string, StoredFile>();
  let clock = 1_000;
  const bookDirectory: BookDirectory = {
    async read(name) {
      return files.get(name)?.bytes ?? null;
    },
    async write(name, bytes) {
      clock += 1;
      files.set(name, { bytes: bytes.slice(), lastModified: clock });
    },
    async remove(name) {
      files.delete(name);
    },
  };
  const directory: BookFileDirectory = {
    async *values() {
      for (const name of files.keys()) yield { kind: "file", name };
    },
    async getFileHandle(name) {
      const stored = files.get(name);
      if (stored == null) {
        throw new DOMException(`missing ${name}`, "NotFoundError");
      }
      return {
        getFile: async () =>
          new File([stored.bytes.slice()], name, {
            lastModified: stored.lastModified,
          }),
      };
    },
  };
  const requests: BookRequest[] = [];
  const requestPersistence = vi.fn(async () => "granted");
  const records = new Map<string, string>();
  const delivered: Array<{ fileName: string; bytes: number[] }> = [];
  const backups = createBookBackups({
    storage: {
      getItem: (key) => records.get(key) ?? null,
      setItem: (key, value) => {
        records.set(key, value);
      },
      removeItem: (key) => {
        records.delete(key);
      },
    },
    now: () => 500,
    deliver: async (bytes, fileName) => {
      delivered.push({ fileName, bytes: [...bytes] });
      return "saved";
    },
  });
  const books = createInAppBooks({
    openDirectory: async () => directory,
    writer: {
      async send(request) {
        requests.push(request);
        await runBookRequest(bookDirectory, request);
      },
    },
    requestPersistence,
    backups,
    locks: createBookLocks(fakeLockManager()),
  });
  return {
    files,
    bookDirectory,
    books,
    requests,
    requestPersistence,
    records,
    delivered,
  };
}

describe("in-app books", () => {
  it("creates a book on its first save and opens it again", async () => {
    const { books } = fakeInAppStorage();

    const created = await books.create("2026年分");
    const result = await created.sink.write(new Uint8Array([7, 8, 9]));
    const listed = await books.list();
    created.release();
    await settleLocks();
    const reopened = await books.open("2026年分.openkk");

    expect(created.bytes).toBeNull();
    expect(created.sink.fileName).toBe("2026年分.openkk");
    expect(result).toBe("written");
    expect(listed.map((book) => [book.name, book.size])).toEqual([
      ["2026年分.openkk", 3],
    ]);
    expect(reopened.bytes).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("picks a free name when a book with the same name exists", async () => {
    const { books } = fakeInAppStorage();
    const first = await books.create("2026年分.openkk");
    await first.sink.write(new Uint8Array([1]));

    const second = await books.create("2026年分.openkk");

    expect(second.sink.fileName).toBe("2026年分 (2).openkk");
  });

  it("reports a conflict when another tab saved the book first", async () => {
    const { books, bookDirectory, files } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([1]));
    created.release();
    await settleLocks();
    const opened = await books.open("2026年分.openkk");
    await runBookRequest(bookDirectory, {
      type: "write",
      name: "2026年分.openkk",
      bytes: new Uint8Array([2, 2]),
    });

    const result = await opened.sink.write(new Uint8Array([3, 3, 3]));

    expect(result).toBe("conflict");
    expect(files.get("2026年分.openkk")?.bytes).toEqual(new Uint8Array([2, 2]));
  });

  it("refuses a book that another tab has open until that tab lets it go", async () => {
    const { books, files } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([1]));

    await expect(books.open("2026年分.openkk")).rejects.toThrow(BookInUseError);
    await expect(books.remove("2026年分.openkk")).rejects.toThrow(
      BookInUseError,
    );
    expect(files.has("2026年分.openkk")).toBe(true);

    created.release();
    await settleLocks();
    const reopened = await books.open("2026年分.openkk");
    expect(reopened.bytes).toEqual(new Uint8Array([1]));
  });

  it("reads a book that another tab has open without taking it", async () => {
    const { books } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([5, 6]));

    await expect(books.read("2026年分.openkk")).resolves.toEqual(
      new Uint8Array([5, 6]),
    );
    await expect(books.read("2025年分.openkk")).rejects.toThrow(
      "in-app book not found",
    );
    await expect(books.open("2026年分.openkk")).rejects.toThrow(BookInUseError);
  });

  it("lets the book go when it cannot be opened", async () => {
    const { books, bookDirectory } = fakeInAppStorage();

    await expect(books.open("2026年分.openkk")).rejects.toThrow(
      "in-app book not found",
    );
    await bookDirectory.write("2026年分.openkk", new Uint8Array([1]));
    await expect(books.open("2026年分.openkk")).resolves.toMatchObject({
      bytes: new Uint8Array([1]),
    });
  });

  it("recovers a save that stopped halfway when the book is opened", async () => {
    const { books, bookDirectory, files } = fakeInAppStorage();
    await bookDirectory.write("2026年分.openkk", new Uint8Array([1]));
    await bookDirectory.write(
      `2026年分.openkk${PENDING_COPY_SUFFIX}`,
      new Uint8Array([4, 4, 4]),
    );
    await bookDirectory.write(
      `2026年分.openkk${READY_MARK_SUFFIX}`,
      new Uint8Array(0),
    );

    const opened = await books.open("2026年分.openkk");

    expect(opened.bytes).toEqual(new Uint8Array([4, 4, 4]));
    expect([...files.keys()]).toEqual(["2026年分.openkk"]);
  });

  it("lists only books, newest first", async () => {
    const { books, bookDirectory } = fakeInAppStorage();
    await bookDirectory.write("2025年分.openkk", new Uint8Array([1]));
    await bookDirectory.write("2026年分.openkk", new Uint8Array([1, 2]));
    await bookDirectory.write(
      `2026年分.openkk${PENDING_COPY_SUFFIX}`,
      new Uint8Array([3]),
    );
    await bookDirectory.write("notes.txt", new Uint8Array([4]));

    const listed = await books.list();

    expect(listed.map((book) => book.name)).toEqual([
      "2026年分.openkk",
      "2025年分.openkk",
    ]);
  });

  it("reports a conflict when a new book's name was taken before its first save", async () => {
    const { books, bookDirectory } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await runBookRequest(bookDirectory, {
      type: "write",
      name: "2026年分.openkk",
      bytes: new Uint8Array([2]),
    });

    expect(await created.sink.write(new Uint8Array([1]))).toBe("conflict");
  });

  it("keeps saving after its own saves without reporting a conflict", async () => {
    const { books } = fakeInAppStorage();
    const created = await books.create("2026年分");

    expect(await created.sink.write(new Uint8Array([1]))).toBe("written");
    expect(await created.sink.write(new Uint8Array([1, 2]))).toBe("written");
    expect(await created.sink.write(new Uint8Array([1, 2, 3]))).toBe("written");
  });

  it("asks the browser to keep the books when one is opened or created", async () => {
    const { books, requestPersistence } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([1]));
    created.release();
    await settleLocks();
    await books.open("2026年分.openkk");

    expect(requestPersistence).toHaveBeenCalledTimes(2);
  });

  it("removes a book and forgets its backups", async () => {
    const { books, records } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([1]));
    created.release();
    await settleLocks();

    await books.remove("2026年分.openkk");

    expect(await books.list()).toEqual([]);
    expect(records.size).toBe(0);
  });

  it("saves a backup of the book under its own name and remembers when", async () => {
    const { books, delivered } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([1]));
    expect(created.backup).toMatchObject({
      firstOpenedAt: 500,
      lastSavedAt: null,
    });

    await created.backup!.write(new Uint8Array([4, 5]), 900);
    created.release();
    await settleLocks();
    const reopened = await books.open("2026年分.openkk");

    expect(delivered).toEqual([{ fileName: "2026年分.openkk", bytes: [4, 5] }]);
    expect(reopened.backup).toMatchObject({
      firstOpenedAt: 500,
      lastSavedAt: 900,
    });
  });
});

describe("worker book writer", () => {
  class FakeWorker {
    static answers: Array<{ ok: boolean; error: string | null }> = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    posted: unknown[] = [];

    postMessage(message: { id: number }): void {
      this.posted.push(message);
      const answer = FakeWorker.answers.shift() ?? { ok: true, error: null };
      queueMicrotask(() => {
        this.onmessage?.({
          data: { id: message.id, ...answer },
        } as MessageEvent);
      });
    }
  }

  it("settles each request by the worker's answer", async () => {
    const workers: FakeWorker[] = [];
    FakeWorker.answers = [
      { ok: true, error: null },
      { ok: false, error: "disk is full" },
    ];
    const writer = createWorkerBookWriter(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });

    await writer.send({ type: "recover", name: "a.openkk" });
    await expect(
      writer.send({ type: "write", name: "a.openkk", bytes: new Uint8Array() }),
    ).rejects.toThrow("disk is full");

    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted).toEqual([
      { id: 1, type: "recover", name: "a.openkk" },
      { id: 2, type: "write", name: "a.openkk", bytes: new Uint8Array() },
    ]);
  });

  it("fails waiting requests and starts a new worker after a crash", async () => {
    const workers: FakeWorker[] = [];
    const writer = createWorkerBookWriter(() => {
      const worker = new FakeWorker();
      worker.postMessage = (message: { id: number }) => {
        worker.posted.push(message);
      };
      workers.push(worker);
      return worker as unknown as Worker;
    });

    const waiting = writer.send({ type: "recover", name: "a.openkk" });
    workers[0]?.onerror?.({ message: "worker crashed" } as ErrorEvent);

    await expect(waiting).rejects.toThrow("worker crashed");
    void writer.send({ type: "recover", name: "a.openkk" });
    expect(workers).toHaveLength(2);
  });
});
