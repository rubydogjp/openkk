import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startOnceAfterMount } from "./start-once-after-mount.js";

describe("startOnceAfterMount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts only the run that survives a strict mode remount", () => {
    const state = { started: false };
    const start = vi.fn();

    const cleanupFirstMount = startOnceAfterMount(state, start);
    cleanupFirstMount();
    startOnceAfterMount(state, start);
    expect(start).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("does not start again when the effect runs after starting", () => {
    const state = { started: false };
    const start = vi.fn();

    startOnceAfterMount(state, start);
    vi.runAllTimers();
    startOnceAfterMount(state, start);
    vi.runAllTimers();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("never starts when unmounted before the deferred start", () => {
    const state = { started: false };
    const start = vi.fn();

    startOnceAfterMount(state, start)();
    vi.runAllTimers();

    expect(start).not.toHaveBeenCalled();
    expect(state.started).toBe(false);
  });
});
