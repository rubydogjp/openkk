import { describe, expect, it } from "vitest";

import { createMemoryDbAdapter } from "./index.js";

describe("createMemoryDbAdapter", () => {
  it("shares safe initialization across concurrent adapter creation", async () => {
    const originalWarn = console.warn;

    const adapters = Promise.all([
      createMemoryDbAdapter(null),
      createMemoryDbAdapter(null),
    ]);
    expect(console.warn).toBe(originalWarn);

    const [first, second] = await adapters;

    expect(first).not.toBe(second);
    expect(console.warn).toBe(originalWarn);
  });
});
