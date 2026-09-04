import { describe, expect, it } from "vitest";

import { AsyncStateVersion } from "./async-state-version.js";

describe("AsyncStateVersion", () => {
  it("rejects a read result after the same key has been invalidated", () => {
    const versions = new AsyncStateVersion<string>();
    const readVersion = versions.capture("fp-1");

    versions.invalidate("fp-1");

    expect(versions.isCurrent("fp-1", readVersion)).toBe(false);
  });

  it("does not invalidate unrelated keys", () => {
    const versions = new AsyncStateVersion<string>();
    const otherPeriodRead = versions.capture("fp-2");

    versions.invalidate("fp-1");

    expect(versions.isCurrent("fp-2", otherPeriodRead)).toBe(true);
  });

  it("gives each successive operation a distinct version", () => {
    const versions = new AsyncStateVersion<string>();

    const first = versions.invalidate("entry-1");
    const second = versions.invalidate("entry-1");

    expect(versions.isCurrent("entry-1", first)).toBe(false);
    expect(versions.isCurrent("entry-1", second)).toBe(true);
  });
});
