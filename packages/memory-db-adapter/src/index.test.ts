import { describe, expect, it } from "vitest";

import { createMemoryDbAdapter } from "./index.js";

describe("createMemoryDbAdapter", () => {
  it("shares safe initialization across concurrent adapter creation", async () => {
    const originalWarn = console.warn;

    const [first, second] = await Promise.all([
      createMemoryDbAdapter(),
      createMemoryDbAdapter(),
    ]);

    expect(first).not.toBe(second);
    expect(console.warn).toBe(originalWarn);
  });
});
