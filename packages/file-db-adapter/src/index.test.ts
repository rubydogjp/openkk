import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryDbWorker } from "../test-support/in-memory-db-worker.js";

type WorkerMessage = {
  id: number;
  type: string;
  payload: unknown;
};

type WorkerOutcome =
  | { kind: "response"; ok: boolean; error?: string; result?: unknown }
  | { kind: "throw"; error: Error }
  | { kind: "hang" };

class FakeWorker {
  static outcomes: WorkerOutcome[] = [];
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  hangNext = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerMessage): void {
    if (this.hangNext) {
      this.hangNext = false;
      return;
    }
    const outcome = FakeWorker.outcomes.shift();
    if (outcome?.kind === "throw") throw outcome.error;
    if (outcome?.kind === "hang") return;
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

  crash(message: string): void {
    this.onerror?.({
      message,
      error: null,
      currentTarget: null,
      srcElement: null,
      target: null,
    } as ErrorEvent);
  }
}

function withDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), 250);
    }),
  ]);
}

describe("createFileDbAdapter — behavior parity over the worker proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    InMemoryDbWorker.instances = [];
  });

  async function makeDb() {
    vi.stubGlobal("Worker", InMemoryDbWorker);
    const { createFileDbAdapter } = await import("./index.js");
    return createFileDbAdapter(
      { vfsName: "opfs-behavior", dbFileName: null },
      null,
    );
  }

  async function seedFiscalPeriod(db: Awaited<ReturnType<typeof makeDb>>) {
    const created = await db.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    return db.fiscalPeriods.update(created.id, { settingsCompleted: true });
  }

  function entryInput(localId: string) {
    return {
      date: "2026-03-01",
      description: "売上",
      localId,
      businessRate: 1,
      lines: [
        {
          side: "debit" as const,
          bookAccountId: "acct_cash",
          amount: 1000,
          partnerName: "",
          taxCategoryId: "",
          businessCategoryId: "",
        },
        {
          side: "credit" as const,
          bookAccountId: "acct_sales",
          amount: 1000,
          partnerName: "",
          taxCategoryId: "",
          businessCategoryId: "",
        },
      ],
    };
  }

  it("persists and reads a fiscal period through the worker proxy", async () => {
    const db = await makeDb();
    const created = await seedFiscalPeriod(db);
    const loaded = await db.fiscalPeriods.getById(created.id);
    expect(loaded?.name).toBe("2026年分");
    expect(await db.fiscalPeriods.getAllByUser("user-1")).toHaveLength(1);
  });

  it("imports entries idempotently on localId", async () => {
    const db = await makeDb();
    const fp = await seedFiscalPeriod(db);

    const first = await db.entries.importMany("user-1", fp.id, [
      entryInput("a"),
      entryInput("b"),
    ]);
    expect(first).toHaveLength(2);

    const second = await db.entries.importMany("user-1", fp.id, [
      entryInput("a"),
      entryInput("c"),
    ]);
    expect(second).toHaveLength(1);
    expect(await db.entries.getAll(fp.id)).toHaveLength(3);
  });

  it("cascades entry deletion when the fiscal period is removed", async () => {
    const db = await makeDb();
    const fp = await seedFiscalPeriod(db);
    await db.entries.create("user-1", fp.id, entryInput("x"));
    expect(await db.entries.getAll(fp.id)).toHaveLength(1);

    await db.fiscalPeriods.delete(fp.id);
    expect(await db.entries.getAll(fp.id)).toEqual([]);
  });

  it("rejects a transition on a missing fiscal period", async () => {
    const db = await makeDb();
    await expect(
      db.fiscalPeriods.update("does-not-exist", { name: "x" }),
    ).rejects.toThrow(/fiscal period not found/i);
  });
});

describe("createFileDbAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeWorker.outcomes = [];
    FakeWorker.instances = [];
  });

  it("clears a failed initialization so callers can retry", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.outcomes = [
      { kind: "response", ok: false, error: "ANOTHER_TAB" },
      { kind: "response", ok: true },
    ];
    const { createFileDbAdapter } = await import("./index.js");

    await expect(
      createFileDbAdapter(
        { vfsName: "opfs-test", dbFileName: null },
        null,
      ),
    ).rejects.toThrow("ANOTHER_TAB");

    const db = await createFileDbAdapter(
      { vfsName: "opfs-test", dbFileName: null },
      null,
    );

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
    const { createFileDbAdapter } = await import("./index.js");

    await expect(
      createFileDbAdapter(
        { vfsName: "opfs-test", dbFileName: null },
        null,
      ),
    ).rejects.toThrow("postMessage failed");

    const db = await createFileDbAdapter(
      { vfsName: "opfs-test", dbFileName: null },
      null,
    );

    expect(db.entries).toBeTruthy();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });

  it("reuses the singleton only for matching file DB options", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { createFileDbAdapter } = await import("./index.js");

    const first = await createFileDbAdapter({
      vfsName: "opfs-test",
      dbFileName: "one.sqlite3",
    }, null);
    const second = await createFileDbAdapter({
      vfsName: "opfs-test",
      dbFileName: "one.sqlite3",
    }, null);

    expect(second).toBe(first);
    expect(() =>
      createFileDbAdapter({
        vfsName: "opfs-test",
        dbFileName: "two.sqlite3",
      }, null),
    ).toThrow(/already initialized with different options/);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("rejects calls after a worker crash and allows recreation", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.outcomes = [{ kind: "response", ok: true }];
    const { createFileDbAdapter } = await import("./index.js");
    const first = await createFileDbAdapter(
      { vfsName: "opfs-test", dbFileName: null },
      null,
    );

    FakeWorker.instances[0]!.hangNext = true;
    const inFlight = first.fiscalPeriods.getAllByUser("user-1");
    await Promise.resolve();
    FakeWorker.instances[0]!.crash("worker boom");

    await expect(withDeadline(inFlight, "in-flight call")).rejects.toThrow(
      "worker boom",
    );
    await expect(
      withDeadline(first.fiscalPeriods.getAllByUser("user-1"), "future call"),
    ).rejects.toThrow("worker boom");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);

    const second = await withDeadline(
      createFileDbAdapter({ vfsName: "opfs-test", dbFileName: null }, null),
      "adapter recreation",
    );
    expect(second).not.toBe(first);
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
