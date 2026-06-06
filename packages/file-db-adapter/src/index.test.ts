import { afterEach, describe, expect, it, vi } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-server-ports";

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

class RealDbWorker {
  static instances: RealDbWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  private dbPromise: Promise<{ exec(arg: unknown): unknown }> | null = null;

  constructor() {
    RealDbWorker.instances.push(this);
  }

  private getDb() {
    if (this.dbPromise == null) {
      this.dbPromise = (async () => {
        const sqlite3 = await sqlite3InitModule({
          print: () => undefined,
          printErr: () => undefined,
        });
        const db = new sqlite3.oo1.DB(":memory:");
        runMigrations(db);
        return db as unknown as { exec(arg: unknown): unknown };
      })();
    }
    return this.dbPromise;
  }

  postMessage(message: WorkerMessage): void {
    void (async () => {
      try {
        const db = await this.getDb();
        if (message.type === "init") {
          this.onmessage?.({
            data: { id: message.id, ok: true },
          } as MessageEvent);
          return;
        }
        const arg = message.payload as { returnValue?: string };
        const wantsRows =
          typeof arg === "object" && arg?.returnValue === "resultRows";
        const result = db.exec(message.payload);
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result: wantsRows ? result : undefined,
          },
        } as MessageEvent);
      } catch (error) {
        this.onmessage?.({
          data: {
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        } as MessageEvent);
      }
    })();
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("createFileDbAdapter — behavior parity over the worker proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    RealDbWorker.instances = [];
  });

  async function makeDb() {
    vi.stubGlobal("Worker", RealDbWorker);
    const { createFileDbAdapter } = await import("./index");
    return createFileDbAdapter({ vfsName: "opfs-behavior" });
  }

  async function seedFiscalPeriod(db: Awaited<ReturnType<typeof makeDb>>) {
    return db.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
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

    // 同じ localId は再取込みでスキップされ、新規のみ挿入される。
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

  it("reuses the singleton only for matching file DB options", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { createFileDbAdapter } = await import("./index");

    const first = await createFileDbAdapter({
      vfsName: "opfs-test",
      dbFileName: "one.sqlite3",
    });
    const second = await createFileDbAdapter({
      vfsName: "opfs-test",
      dbFileName: "one.sqlite3",
    });

    expect(second).toBe(first);
    expect(() =>
      createFileDbAdapter({
        vfsName: "opfs-test",
        dbFileName: "two.sqlite3",
      }),
    ).toThrow(/already initialized with different options/);
    expect(FakeWorker.instances).toHaveLength(1);
  });
});
