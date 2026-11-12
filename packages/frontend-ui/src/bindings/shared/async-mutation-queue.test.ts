import { describe, expect, it } from "vitest";

import {
  AsyncMutationQueue,
  KeyedAsyncMutationQueue,
} from "./async-mutation-queue.js";

describe("AsyncMutationQueue", () => {
  it("runs mutations in invocation order even when the first is delayed", async () => {
    const events: string[] = [];
    const queue = new AsyncMutationQueue();
    let releaseFirst = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
      return "first";
    });
    const second = queue.run(async () => {
      events.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("continues after a failed mutation", async () => {
    const queue = new AsyncMutationQueue();
    const first = queue.run(async () => {
      throw new Error("failed");
    });
    const second = queue.run(async () => "recovered");

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });
});

describe("KeyedAsyncMutationQueue", () => {
  it("serializes each key without blocking a different key", async () => {
    const events: string[] = [];
    const queue = new KeyedAsyncMutationQueue<string>();
    let releaseFirst = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run("entry-1", async () => {
      events.push("entry-1:first:start");
      await firstGate;
      events.push("entry-1:first:end");
    });
    const second = queue.run("entry-1", async () => {
      events.push("entry-1:second");
    });
    const other = queue.run("entry-2", async () => {
      events.push("entry-2:first");
    });

    await other;
    expect(events).toEqual(["entry-1:first:start", "entry-2:first"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual([
      "entry-1:first:start",
      "entry-2:first",
      "entry-1:first:end",
      "entry-1:second",
    ]);
  });

  it("continues a key after an earlier operation fails", async () => {
    const queue = new KeyedAsyncMutationQueue<string>();
    const first = queue.run("asset-1", async () => {
      throw new Error("failed");
    });
    const second = queue.run("asset-1", async () => "recovered");

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });
});
