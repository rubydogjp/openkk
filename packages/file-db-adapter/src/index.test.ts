import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerMessage = {
  id: number;
  type: string;
  payload: unknown;
};

type WorkerOutcome =
  | { kind: "response"; ok: boolean; error?: string; result?: unknown }
  | { kind: "throw"; error: Error };

class FakeWorker {
  static outcomes: WorkerOutcome[] = [];
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerMessage): void {
    const outcome = FakeWorker.outcomes.shift();
    if (outcome?.kind === "throw") throw outcome.error;
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          id: message.id,
          ok: outcome?.ok ?? true,
          result: outcome?.result,
          error: outcome?.error,
        },
      } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("createFileDbAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeWorker.outcomes = [];
    FakeWorker.instances = [];
  });

  it("clears the singleton cache when worker initialization fails so callers can retry", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.outcomes = [
      { kind: "response", ok: false, error: "ANOTHER_TAB" },
      { kind: "response", ok: true },
    ];
    const { createFileDbAdapter } = await import("./index");

    await expect(createFileDbAdapter({ vfsName: "opfs-test" })).rejects.toThrow(
      "ANOTHER_TAB",
    );

    const db = await createFileDbAdapter({ vfsName: "opfs-test" });

    expect(db.fiscalPeriods).toBeTruthy();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it("does not leave a rejected initialization cached when postMessage throws", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.outcomes = [
      { kind: "throw", error: new Error("postMessage failed") },
      { kind: "response", ok: true },
    ];
    const { createFileDbAdapter } = await import("./index");

    await expect(createFileDbAdapter({ vfsName: "opfs-test" })).rejects.toThrow(
      "postMessage failed",
    );

    const db = await createFileDbAdapter({ vfsName: "opfs-test" });

    expect(db.entries).toBeTruthy();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });
});
