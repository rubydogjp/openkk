import { describe, expect, it } from "vitest";

import {
  isCustomUser,
  isEmbeddedUser,
  userCanSignOut,
  userEmail,
  type CustomUser,
  type EmbeddedUser,
} from "./user";

const embedded: EmbeddedUser = {
  kind: "embedded",
  id: "openkk-prod-user",
  displayName: "このPCのデータ",
};

const custom: CustomUser = {
  kind: "custom",
  id: "u-123",
  displayName: "山田太郎",
  email: "taro@example.com",
  iconUrl: null,
  authProvider: "google",
};

describe("OpenkkUser helpers", () => {
  it("discriminates embedded vs custom", () => {
    expect(isEmbeddedUser(embedded)).toBe(true);
    expect(isCustomUser(embedded)).toBe(false);
    expect(isEmbeddedUser(custom)).toBe(false);
    expect(isCustomUser(custom)).toBe(true);
  });

  it("only custom users can sign out", () => {
    expect(userCanSignOut(embedded)).toBe(false);
    expect(userCanSignOut(custom)).toBe(true);
  });

  it("exposes email only for custom users", () => {
    expect(userEmail(embedded)).toBe("");
    expect(userEmail(custom)).toBe("taro@example.com");
  });
});
