import { describe, expect, it } from "vitest";

import {
  AsyncStateVersion,
  KeyedAsyncStateVersion,
} from "./async-state-version.js";

describe("KeyedAsyncStateVersion", () => {
  it("rejects a read result after the same key has been invalidated", () => {
    const versions = new KeyedAsyncStateVersion<string>();
    const readVersion = versions.capture("fp-1");

    versions.invalidate("fp-1");

    expect(versions.isCurrent("fp-1", readVersion)).toBe(false);
  });

  it("does not invalidate unrelated keys", () => {
    const versions = new KeyedAsyncStateVersion<string>();
    const otherPeriodRead = versions.capture("fp-2");

    versions.invalidate("fp-1");

    expect(versions.isCurrent("fp-2", otherPeriodRead)).toBe(true);
  });

  it("gives each successive operation a distinct version", () => {
    const versions = new KeyedAsyncStateVersion<string>();

    const first = versions.invalidate("entry-1");
    const second = versions.invalidate("entry-1");

    expect(versions.isCurrent("entry-1", first)).toBe(false);
    expect(versions.isCurrent("entry-1", second)).toBe(true);
  });
});

describe("AsyncStateVersion", () => {
  it("rejects a captured version after the single slot is invalidated", () => {
    const versions = new AsyncStateVersion();
    const captured = versions.capture();

    expect(versions.isCurrent(captured)).toBe(true);
    versions.invalidate();

    expect(versions.isCurrent(captured)).toBe(false);
  });
});
