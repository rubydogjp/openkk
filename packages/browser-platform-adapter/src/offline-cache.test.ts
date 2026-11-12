import { afterEach, describe, expect, it, vi } from "vitest";

import { browserOfflineCache } from "./offline-cache.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserOfflineCache", () => {
  it("registers the service worker with an encoded build version", () => {
    const register = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    browserOfflineCache.register("/sw.js", "build 1");

    expect(register).toHaveBeenCalledWith("/sw.js?v=build%201");
  });

  it("does nothing where service workers are unsupported", () => {
    vi.stubGlobal("navigator", {});

    expect(() => browserOfflineCache.register("/sw.js", "1")).not.toThrow();
  });
});
