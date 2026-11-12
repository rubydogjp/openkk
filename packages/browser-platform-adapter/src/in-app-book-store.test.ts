import { describe, expect, it } from "vitest";

import {
  PENDING_COPY_SUFFIX,
  READY_MARK_SUFFIX,
  runBookRequest,
  type BookDirectory,
  type BookRequest,
} from "./in-app-book-protocol.js";
import {
  createInAppBookStore,
  createWorkerBookWriter,
  newInAppBookName,
  type InAppBookDirectory,
} from "./in-app-book-store.js";

function fakeInAppStorage() {
  const files = new Map<string, Uint8Array>();
  const bookDirectory: BookDirectory = {
    async read(name) {
      return files.get(name) ?? null;
    },
    async write(name, bytes) {
      files.set(name, bytes.slice());
    },
    async remove(name) {
      files.delete(name);
    },
  };
  const directory: InAppBookDirectory = {
    async *values() {
      for (const name of [...files.keys()]) yield { kind: "file", name };
      yield { kind: "directory", name: "folder.openkk" };
    },
    async getFileHandle(name) {
      const stored = files.get(name);
      if (stored == null) {
        throw new DOMException(`missing ${name}`, "NotFoundError");
      }
      return { getFile: async () => new File([stored.slice()], name) };
    },
  };
  const requests: BookRequest[] = [];
  const store = createInAppBookStore({
    openDirectory: async () => directory,
    writer: {
      async send(request) {
        requests.push(request);
        await runBookRequest(bookDirectory, request);
      },
    },
  });
  return { files, store, requests };
}

const bytesOf = (...values: number[]) => new Uint8Array(values);

describe("in-app book store", () => {
  it("writes, lists, reads and removes books", async () => {
    const { store, files } = fakeInAppStorage();

    await store.write("b.openkk", bytesOf(2));
    await store.write("a.openkk", bytesOf(1));
    await store.write("a.openkk", bytesOf(1, 1));
    const listed = await store.list();
    const read = await store.read("a.openkk");
    await store.remove("b.openkk");

    expect(listed).toEqual(["a.openkk", "b.openkk"]);
    expect([...(read ?? [])]).toEqual([1, 1]);
    expect(await store.list()).toEqual(["a.openkk"]);
    expect(await store.read("b.openkk")).toBeNull();
    expect([...files.keys()]).toEqual(["a.openkk"]);
  });

  it("lists only book files", async () => {
    const { store, files } = fakeInAppStorage();
    files.set("notes.txt", bytesOf(9));
    files.set("a.openkk", bytesOf(1));

    expect(await store.list()).toEqual(["a.openkk"]);
  });

  it("finishes a first save that stopped after the copy was ready", async () => {
    const { store, files } = fakeInAppStorage();
    files.set(`new.openkk${PENDING_COPY_SUFFIX}`, bytesOf(5, 6));
    files.set(`new.openkk${READY_MARK_SUFFIX}`, bytesOf());

    const listed = await store.list();

    expect(listed).toEqual(["new.openkk"]);
    expect([...((await store.read("new.openkk")) ?? [])]).toEqual([5, 6]);
    expect([...files.keys()]).toEqual(["new.openkk"]);
  });

  it("drops a first save that stopped before the copy was ready", async () => {
    const { store, files } = fakeInAppStorage();
    files.set(`new.openkk${PENDING_COPY_SUFFIX}`, bytesOf(5));

    expect(await store.list()).toEqual([]);
    expect([...files.keys()]).toEqual([]);
  });

  it("restores a book whose save stopped while the book itself was being written", async () => {
    const { store, files } = fakeInAppStorage();
    files.set("a.openkk", bytesOf(1));
    files.set(`a.openkk${PENDING_COPY_SUFFIX}`, bytesOf(1, 2, 3));
    files.set(`a.openkk${READY_MARK_SUFFIX}`, bytesOf());

    expect(await store.list()).toEqual(["a.openkk"]);
    expect([...((await store.read("a.openkk")) ?? [])]).toEqual([1, 2, 3]);
  });

  it("keeps the book when a save stopped before its copy was ready", async () => {
    const { store, files } = fakeInAppStorage();
    files.set("a.openkk", bytesOf(1));
    files.set(`a.openkk${PENDING_COPY_SUFFIX}`, bytesOf(1, 2));

    expect([...((await store.read("a.openkk")) ?? [])]).toEqual([1]);
    expect([...files.keys()]).toEqual(["a.openkk"]);
  });

  it("names new books so that they never collide", () => {
    const names = new Set(Array.from({ length: 50 }, newInAppBookName));

    expect(names.size).toBe(50);
    expect(
      [...names].every((name) => /^[0-9a-f-]{36}\.openkk$/.test(name)),
    ).toBe(true);
  });
});

describe("worker book writer", () => {
  function fakeWorker() {
    const posted: Array<{ id: number }> = [];
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      postMessage(message: { id: number }) {
        posted.push(message);
      },
    };
    return { worker, posted };
  }

  it("resolves each request with its own answer", async () => {
    const { worker, posted } = fakeWorker();
    const writer = createWorkerBookWriter(() => worker as unknown as Worker);

    const first = writer.send({ type: "remove", name: "a.openkk" });
    const second = writer.send({ type: "remove", name: "b.openkk" });
    worker.onmessage?.({
      data: { id: posted[1]!.id, ok: false, error: "no space" },
    } as MessageEvent);
    worker.onmessage?.({
      data: { id: posted[0]!.id, ok: true, error: null },
    } as MessageEvent);

    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow("no space");
  });

  it("fails every waiting request when the worker crashes and starts a new worker next time", async () => {
    const created: Array<ReturnType<typeof fakeWorker>> = [];
    const writer = createWorkerBookWriter(() => {
      const next = fakeWorker();
      created.push(next);
      return next.worker as unknown as Worker;
    });

    const waiting = writer.send({ type: "remove", name: "a.openkk" });
    created[0]!.worker.onerror?.({ message: "crashed" } as ErrorEvent);
    await expect(waiting).rejects.toThrow("crashed");
    void writer.send({ type: "remove", name: "b.openkk" }).catch(() => {});

    expect(created).toHaveLength(2);
  });
});
