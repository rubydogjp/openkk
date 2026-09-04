import { describe, expect, it } from "vitest";

import { AuthOperationGuard } from "./auth-operation-guard.js";

describe("AuthOperationGuard", () => {
  it("rejects an operation after the user session changes", () => {
    const guard = new AuthOperationGuard();
    const version = guard.capture();

    expect(() => guard.assertCurrent(version)).not.toThrow();
    guard.invalidate();
    expect(guard.isCurrent(version)).toBe(false);
    expect(() => guard.assertCurrent(version)).toThrow(
      /Authentication operation was superseded/,
    );
  });
});
