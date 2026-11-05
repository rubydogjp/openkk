import { describe, expect, it, vi } from "vitest";

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
  const books = createInAppBooks({
    openDirectory: async () => directory,
    writer: {
      async send(request) {
        requests.push(request);
        await runBookRequest(bookDirectory, request);
      },
    },
    requestPersistence,
  });
  return { files, bookDirectory, books, requests, requestPersistence };
}

describe("in-app books", () => {
  it("creates a book on its first save and opens it again", async () => {
    const { books } = fakeInAppStorage();

    const created = await books.create("2026年分");
    const result = await created.sink.write(new Uint8Array([7, 8, 9]));
    const listed = await books.list();
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
    await books.open("2026年分.openkk");

    expect(requestPersistence).toHaveBeenCalledTimes(2);
  });

  it("removes a book", async () => {
    const { books } = fakeInAppStorage();
    const created = await books.create("2026年分");
    await created.sink.write(new Uint8Array([1]));

    await books.remove("2026年分.openkk");

    expect(await books.list()).toEqual([]);
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
