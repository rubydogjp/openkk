import { describe, expect, it, vi } from "vitest";

import type {
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";
import { serializeOpenkkDbPortOperations } from "./serialized-port.js";

describe("serializeOpenkkDbPortOperations", () => {
  it("does not start a read while a preceding write is still in progress", async () => {
    const trace: string[] = [];
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const fiscalPeriods = {
      create: vi.fn(async () => {
        trace.push("write:start");
        await writeGate;
        trace.push("write:end");
        return { id: "fp-1" };
      }),
      getAllByUser: vi.fn(async () => {
        trace.push("read");
        return [];
      }),
    };
    const namespace = fiscalPeriods as unknown as OpenkkDbPort["fiscalPeriods"];
    const port = serializeOpenkkDbPortOperations({
      fiscalPeriods: namespace,
      entries: {} as OpenkkDbPort["entries"],
      fixedAssets: {} as OpenkkDbPort["fixedAssets"],
      preClosings: {} as OpenkkDbPort["preClosings"],
      closings: {} as OpenkkDbPort["closings"],
      masterData: {} as OpenkkDbPort["masterData"],
    });

    const writing = port.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const reading = port.fiscalPeriods.getAllByUser("user-1");
    await Promise.resolve();
    await Promise.resolve();
    expect(trace).toEqual(["write:start"]);

    releaseWrite();
    await Promise.all([writing, reading]);
    expect(trace).toEqual(["write:start", "write:end", "read"]);
  });

  it("continues the queue after a failed operation", async () => {
    const fiscalPeriods = {
      getById: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(null),
    };
    const port = serializeOpenkkDbPortOperations({
      fiscalPeriods: fiscalPeriods as unknown as OpenkkDbPort["fiscalPeriods"],
      entries: {} as OpenkkDbPort["entries"],
      fixedAssets: {} as OpenkkDbPort["fixedAssets"],
      preClosings: {} as OpenkkDbPort["preClosings"],
      closings: {} as OpenkkDbPort["closings"],
      masterData: {} as OpenkkDbPort["masterData"],
    });

    await expect(port.fiscalPeriods.getById("fp-1")).rejects.toThrow("boom");
    await expect(port.fiscalPeriods.getById("fp-1")).resolves.toBeNull();
  });
});
