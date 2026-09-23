import { describe, expect, it } from "vitest";

import { AsyncStateVersion } from "./async-state-version.js";
import { assertAuthUnchanged } from "./auth-operation-guard.js";

describe("assertAuthUnchanged", () => {
  it("rejects an operation after the user session changes", () => {
    const versions = new AsyncStateVersion();
    const version = versions.capture();

    expect(() => assertAuthUnchanged(versions, version)).not.toThrow();
    versions.invalidate();

    expect(() => assertAuthUnchanged(versions, version)).toThrow(
      /Authentication operation was superseded/,
    );
  });
});
