import { describe, expect, it } from "vitest";

import { errorShownIn } from "./period-scoped-error.js";

describe("errorShownIn", () => {
  it("shows an error only in the period whose action failed", () => {
    const failure = new Error("pre-closing failed");
    const scoped = { fiscalPeriodId: "fp-1", error: failure };

    expect(errorShownIn(scoped, "fp-1")).toBe(failure);
    expect(errorShownIn(scoped, "fp-2")).toBeNull();
    expect(errorShownIn(null, "fp-1")).toBeNull();
  });
});
