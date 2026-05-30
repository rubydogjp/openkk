import { describe, expect, it } from "vitest";

import { getStepNoForPathname } from "./step-page-screen";

describe("getStepNoForPathname", () => {
  it("matches step paths without trailing slash", () => {
    expect(getStepNoForPathname("/steps/closing")).toBe(4);
  });

  it("matches step paths with trailing slash", () => {
    expect(getStepNoForPathname("/steps/closing/")).toBe(4);
  });

  it("does not treat /steps as a concrete step page", () => {
    expect(getStepNoForPathname("/steps/")).toBeNull();
  });
});
