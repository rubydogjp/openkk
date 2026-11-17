import { describe, expect, it } from "vitest";

import { createMemoryDbAdapter } from "./index.js";

describe("createMemoryDbAdapter", () => {
  it("creates independent adapters concurrently", async () => {
    const [first, second] = await Promise.all([
      createMemoryDbAdapter(null),
      createMemoryDbAdapter(null),
    ]);

    expect(first).not.toBe(second);
  });
});

describe("closing a memory database", () => {
  it("stops answering once closed", async () => {
    const adapter = await createMemoryDbAdapter(null);
    expect(await adapter.fiscalPeriods.getAll("user-1")).toEqual([]);
    adapter.close();
    await expect(adapter.fiscalPeriods.getAll("user-1")).rejects.toThrow();
  });
});
