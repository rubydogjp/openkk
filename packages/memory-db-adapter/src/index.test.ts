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
