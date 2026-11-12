import { describe, expect, it } from "vitest";

import { ExclusiveActionLock } from "./exclusive-action-lock.js";

describe("ExclusiveActionLock", () => {
  it("rejects a duplicate action until the first action releases", () => {
    const lock = new ExclusiveActionLock();
    const release = lock.tryAcquire();

    expect(release).toBeTypeOf("function");
    expect(lock.isLocked).toBe(true);
    expect(lock.tryAcquire()).toBeNull();

    release?.();
    expect(lock.isLocked).toBe(false);
    expect(lock.tryAcquire()).toBeTypeOf("function");
  });

  it("allows release to be called more than once safely", () => {
    const lock = new ExclusiveActionLock();
    const release = lock.tryAcquire();

    release?.();
    release?.();

    expect(lock.tryAcquire()).toBeTypeOf("function");
  });
});
