import { describe, expect, it } from "vitest";

import {
  createSignInReturnPathStore,
  normalizeSignInReturnPath,
  SIGN_IN_RETURN_PATH_LIFETIME_MS,
} from "./sign-in-return-path.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

const sessionStorageKey = "openkk.session";
const key = "openkk.session.sign_in_return_path";
const now = new Date("2026-09-30T00:00:00.000Z");

describe("normalizeSignInReturnPath", () => {
  it("accepts same-origin paths with query and hash", () => {
    expect(normalizeSignInReturnPath("/device")).toBe("/device");
    expect(normalizeSignInReturnPath("/device?x=1#top")).toBe("/device?x=1#top");
  });

  it("rejects anything that could leave the site", () => {
    for (const value of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "javascript:alert(1)",
      "device",
      "",
      "/a\nb",
      null,
      42,
    ]) {
      expect(normalizeSignInReturnPath(value), String(value)).toBeNull();
    }
  });
});

describe("createSignInReturnPathStore", () => {
  it("returns the remembered path once", () => {
    const storage = memoryStorage();
    const returnPath = createSignInReturnPathStore(storage, sessionStorageKey);
    expect(returnPath.remember("/device", now)).toBe(true);
    expect(storage.values.has(key)).toBe(true);

    expect(returnPath.take(now)).toBe("/device");
    expect(returnPath.take(now)).toBeNull();
  });

  it("forgets a pending path so a later plain sign-in lands on the default page", () => {
    const storage = memoryStorage();
    const returnPath = createSignInReturnPathStore(storage, sessionStorageKey);
    returnPath.remember("/device", now);

    returnPath.forget();

    expect(returnPath.take(now)).toBeNull();
  });

  it("forgets a return path that was started too long ago", () => {
    const storage = memoryStorage();
    const returnPath = createSignInReturnPathStore(storage, sessionStorageKey);
    returnPath.remember("/device", now);
    const later = new Date(now.getTime() + SIGN_IN_RETURN_PATH_LIFETIME_MS + 1);

    expect(returnPath.take(later)).toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });

  it("does not store an unsafe path", () => {
    const storage = memoryStorage();
    const returnPath = createSignInReturnPathStore(storage, sessionStorageKey);
    expect(returnPath.remember("//evil.example", now)).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it("ignores tampered or broken stored values", () => {
    const storage = memoryStorage();
    const returnPath = createSignInReturnPathStore(storage, sessionStorageKey);
    storage.setItem(key, JSON.stringify({ path: "https://evil.example", savedAt: now.getTime() }));
    expect(returnPath.take(now)).toBeNull();
    storage.setItem(key, "{");
    expect(returnPath.take(now)).toBeNull();
    storage.setItem(key, JSON.stringify({ path: "/device" }));
    expect(returnPath.take(now)).toBeNull();
  });
});
