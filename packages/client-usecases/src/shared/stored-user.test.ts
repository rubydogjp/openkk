import { describe, expect, it } from "vitest";

import { readStoredUser } from "./stored-user.js";

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
