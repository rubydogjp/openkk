import { describe, expect, it, vi } from "vitest";

import { serializePortOperations } from "./serialize-port.js";

describe("serializePortOperations", () => {
  it("does not start a read while a preceding write is still in progress", async () => {
    const trace: string[] = [];
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const port = serializePortOperations({
      fiscalPeriods: {
        create: vi.fn(async () => {
          trace.push("write:start");
          await writeGate;
          trace.push("write:end");
          return { id: "fp-1" };
        }),
      },
      entries: {
        getAll: vi.fn(async () => {
          trace.push("read");
          return [];
        }),
      },
    });

    const writing = port.fiscalPeriods.create();
    const reading = port.entries.getAll();
    await Promise.resolve();
    await Promise.resolve();
    expect(trace).toEqual(["write:start"]);

    releaseWrite();
    await Promise.all([writing, reading]);
    expect(trace).toEqual(["write:start", "write:end", "read"]);
  });

  it("continues the queue after a failed operation", async () => {
    const port = serializePortOperations({
      fiscalPeriods: {
        getById: vi
          .fn()
          .mockRejectedValueOnce(new Error("boom"))
          .mockResolvedValueOnce(null),
      },
    });

    await expect(port.fiscalPeriods.getById()).rejects.toThrow("boom");
    await expect(port.fiscalPeriods.getById()).resolves.toBeNull();
  });

  it("passes non-function members through untouched", () => {
    const port = serializePortOperations({ meta: { version: 4 } });
    expect(port.meta.version).toBe(4);
  });
});
