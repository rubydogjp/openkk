import { describe, expect, it } from "vitest";

import {
  readStoredUser,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from "./browser-storage.js";

describe("readStoredUser", () => {
  it("normalizes optional local-storage fields without exposing invalid types", () => {
    expect(
      readStoredUser(
        JSON.stringify({
          kind: "custom",
          id: "user-1",
          displayName: { unexpected: true },
          email: 123,
          iconUrl: false,
          authProvider: [],
        }),
      ),
    ).toEqual({
      kind: "custom",
      id: "user-1",
      displayName: "user-1",
      email: null,
      iconUrl: null,
      authProvider: "custom",
    });
  });

  it("rejects malformed JSON and blank user IDs", () => {
    expect(readStoredUser("{")).toBeNull();
    expect(
      readStoredUser(JSON.stringify({ kind: "custom", id: "   " })),
    ).toBeNull();
  });

  it("drops an unsafe icon URL restored from local storage", () => {
    expect(
      readStoredUser(
        JSON.stringify({
          kind: "custom",
          id: "user-1",
          iconUrl: "javascript:alert(1)",
        }),
      ),
    ).toMatchObject({ iconUrl: null });
  });
});

describe("safe storage access", () => {
  it("keeps UI state usable when localStorage access throws", () => {
    const blocked = {
      getItem(): string | null {
        throw new Error("blocked");
      },
      setItem(): void {
        throw new Error("quota exceeded");
      },
      removeItem(): void {
        throw new Error("blocked");
      },
    };

    expect(safeStorageGet(blocked, "session")).toBeNull();
    expect(() => safeStorageSet(blocked, "session", "value")).not.toThrow();
    expect(() => safeStorageRemove(blocked, "session")).not.toThrow();
  });
});
