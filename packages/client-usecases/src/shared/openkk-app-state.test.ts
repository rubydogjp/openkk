import { describe, expect, it } from "vitest";

import { resolveFiscalPeriodPatchStage } from "./openkk-app-state";

describe("resolveFiscalPeriodPatchStage", () => {
  it("does not turn provisional closing into final closing", () => {
    expect(
      resolveFiscalPeriodPatchStage({ provisionalClosingCompleted: true }),
    ).toBeUndefined();
  });

  it("moves back to journalizing when provisional closing is cancelled", () => {
    expect(
      resolveFiscalPeriodPatchStage({ provisionalClosingCompleted: false }),
    ).toBe("journalizing");
  });

  it("keeps explicit stage changes", () => {
    expect(
      resolveFiscalPeriodPatchStage({
        stage: "post_closing",
        provisionalClosingCompleted: true,
      }),
    ).toBe("post_closing");
  });
});
