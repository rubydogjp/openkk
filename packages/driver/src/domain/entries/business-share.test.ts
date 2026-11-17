import { describe, expect, it } from "vitest";

import { businessShareOfAmount } from "./entry-record.js";

describe("businessShareOfAmount", () => {
  it("matches the engine on a share where floating point falls just below the half", () => {
    expect(businessShareOfAmount(100, 0.145)).toBe(15);
    expect(businessShareOfAmount(1_000, 0.335)).toBe(335);
    expect(businessShareOfAmount(5, 0.5)).toBe(3);
  });
});
