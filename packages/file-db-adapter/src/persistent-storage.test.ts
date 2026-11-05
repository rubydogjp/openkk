import { afterEach, describe, expect, it, vi } from "vitest";

import {
  browserPersistentStorage,
  type PersistentStorage,
  requestPersistentStorage,
} from "./persistent-storage.js";

function fakeStorage(persisted: boolean, granted: boolean) {
  return {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => granted),
  };
}

describe("requestPersistentStorage", () => {
  it("reports unsupported when the browser has no storage manager", async () => {
    expect(await requestPersistentStorage(null)).toBe("unsupported");
  });

  it("does not ask again once the browser already keeps the data", async () => {
    const storage = fakeStorage(true, true);

    expect(await requestPersistentStorage(storage)).toBe("already_persisted");
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("asks the browser to keep the data and reports its answer", async () => {
    const granting = fakeStorage(false, true);
    const denying = fakeStorage(false, false);

    expect(await requestPersistentStorage(granting)).toBe("granted");
    expect(await requestPersistentStorage(denying)).toBe("denied");
    expect(granting.persist).toHaveBeenCalledTimes(1);
    expect(denying.persist).toHaveBeenCalledTimes(1);
  });

  it("reports a failure instead of throwing when the browser refuses to answer", async () => {
    const storage: PersistentStorage = {
      persisted: async () => {
        throw new Error("storage access blocked");
      },
      persist: async () => true,
    };

    expect(await requestPersistentStorage(storage)).toBe("failed");
  });
});

describe("browserPersistentStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the navigator storage manager when it can persist data", () => {
    const storage = fakeStorage(false, true);
    vi.stubGlobal("navigator", { storage });

    expect(browserPersistentStorage()).toBe(storage);
  });

  it("returns null when the browser cannot persist data", () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({}) } });
    expect(browserPersistentStorage()).toBeNull();

    vi.stubGlobal("navigator", {});
    expect(browserPersistentStorage()).toBeNull();
  });
});
