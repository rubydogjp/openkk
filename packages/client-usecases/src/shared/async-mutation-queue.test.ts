import { describe, expect, it } from "vitest";

import { AsyncMutationQueue } from "./async-mutation-queue.js";

describe("AsyncMutationQueue", () => {
  it("runs mutations in invocation order even when the first is delayed", async () => {
    const events: string[] = [];
    const queue = new AsyncMutationQueue();
    let releaseFirst: (() => void) | undefined;
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
    releaseFirst?.();

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
