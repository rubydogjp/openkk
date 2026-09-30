import { afterEach, describe, expect, it, vi } from "vitest";

import { browserStorage } from "./storage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserStorage", () => {
  it("reads and writes localStorage", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    browserStorage.setItem("session", "value");
    expect(browserStorage.getItem("session")).toBe("value");
    browserStorage.removeItem("session");
    expect(browserStorage.getItem("session")).toBeNull();
  });

  it("keeps UI state usable when localStorage access throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem(): string | null {
          throw new Error("blocked");
        },
        setItem(): void {
          throw new Error("quota exceeded");
        },
        removeItem(): void {
          throw new Error("blocked");
        },
      },
    });

    expect(browserStorage.getItem("session")).toBeNull();
    expect(() => browserStorage.setItem("session", "value")).not.toThrow();
    expect(() => browserStorage.removeItem("session")).not.toThrow();
  });

  it("treats a blocked localStorage getter as missing storage", () => {
    vi.stubGlobal(
      "window",
      Object.defineProperty({}, "localStorage", {
        get() {
          throw new Error("SecurityError");
        },
      }),
    );

    expect(browserStorage.getItem("session")).toBeNull();
    expect(() => browserStorage.setItem("session", "value")).not.toThrow();
  });
});
