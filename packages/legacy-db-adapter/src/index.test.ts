import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerMessage = {
  id: number;
  type: string;
  payload: unknown;
};

type WorkerOutcome =
  | { kind: "response"; ok: boolean; error?: string; result?: unknown }
  | { kind: "waitThenRespond"; release: Promise<void> };

class FakeWorker {
  static outcomes: WorkerOutcome[] = [];
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: WorkerMessage[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerMessage): void {
    this.posted.push(message);
    const outcome = FakeWorker.outcomes.shift();
    if (outcome?.kind === "waitThenRespond") {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { event: "waiting_for_another_tab" },
        } as MessageEvent);
      });
      void outcome.release.then(() => {
        this.onmessage?.({
          data: { id: message.id, ok: true, result: null },
        } as MessageEvent);
      });
      return;
    }
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          id: message.id,
          ok: outcome?.ok ?? true,
          result: outcome?.result,
          error: outcome?.error,
        },
        source: null,
        currentTarget: null,
        srcElement: null,
        target: null,
      } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("exportLegacyDbBytes", () => {
  const options = {
    vfsName: "opfs-test",
    dbFileName: "test.sqlite3",
    onWaitingForAnotherTab: null,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeWorker.outcomes = [];
    FakeWorker.instances = [];
  });

  function stubStorageRoot(poolExists: boolean) {
    const getDirectoryHandle = vi.fn(async () => {
      if (!poolExists) throw new DOMException("missing", "NotFoundError");
      return {};
    });
    vi.stubGlobal("navigator", {
      storage: { getDirectory: async () => ({ getDirectoryHandle }) },
    });
    vi.stubGlobal("Worker", FakeWorker);
    return getDirectoryHandle;
  }

  it("returns nothing without starting SQLite when the database was never made", async () => {
    const getDirectoryHandle = stubStorageRoot(false);
    const { exportLegacyDbBytes } = await import("./index.js");

    await expect(exportLegacyDbBytes(options)).resolves.toBeNull();
    expect(getDirectoryHandle).toHaveBeenCalledWith(".opfs-test", {
      create: false,
    });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("returns nothing when the browser keeps no files for this site", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("Worker", FakeWorker);
    const { exportLegacyDbBytes } = await import("./index.js");

    await expect(exportLegacyDbBytes(options)).resolves.toBeNull();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("exports the database through the worker and then lets the worker go", async () => {
    stubStorageRoot(true);
    FakeWorker.outcomes = [
      { kind: "response", ok: true, result: new Uint8Array([1, 2, 3]) },
    ];
    const { exportLegacyDbBytes } = await import("./index.js");

    await expect(exportLegacyDbBytes(options)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const worker = FakeWorker.instances[0]!;
    expect(worker.posted).toEqual([
      {
        id: 1,
        type: "export",
        payload: { vfsName: "opfs-test", dbFileName: "test.sqlite3" },
      },
    ]);
    expect(worker.terminated).toBe(true);
  });

  it("reports another tab and exports once that tab lets go", async () => {
    stubStorageRoot(true);
    let releaseOtherTab: () => void = () => {};
    FakeWorker.outcomes = [
      {
        kind: "waitThenRespond",
        release: new Promise<void>((resolve) => {
          releaseOtherTab = resolve;
        }),
      },
    ];
    const waiting = vi.fn();
    const { exportLegacyDbBytes } = await import("./index.js");

    const exported = exportLegacyDbBytes({
      ...options,
      onWaitingForAnotherTab: waiting,
    });
    await vi.waitFor(() => expect(waiting).toHaveBeenCalledOnce());
    expect(FakeWorker.instances[0]!.terminated).toBe(false);

    releaseOtherTab();
    await expect(exported).resolves.toBeNull();
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
  });

  it("lets the worker go when the export fails", async () => {
    stubStorageRoot(true);
    FakeWorker.outcomes = [
      {
        kind: "response",
        ok: false,
        error: "database disk image is malformed",
      },
    ];
    const { exportLegacyDbBytes } = await import("./index.js");

    await expect(exportLegacyDbBytes(options)).rejects.toThrow(
      "database disk image is malformed",
    );
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
  });
});
