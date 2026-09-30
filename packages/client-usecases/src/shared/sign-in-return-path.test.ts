import { describe, expect, it } from "vitest";

import {
  forgetSignInReturnPath,
  normalizeSignInReturnPath,
  rememberSignInReturnPath,
  SIGN_IN_RETURN_PATH_LIFETIME_MS,
  takeSignInReturnPath,
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

const key = "openkk.session.return_path";
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

describe("remember and take the return path", () => {
  it("returns the remembered path once", () => {
    const storage = memoryStorage();
    expect(rememberSignInReturnPath(storage, key, "/device", now)).toBe(true);

    expect(takeSignInReturnPath(storage, key, now)).toBe("/device");
    expect(takeSignInReturnPath(storage, key, now)).toBeNull();
  });

  it("forgets a return path that was started too long ago", () => {
    const storage = memoryStorage();
    rememberSignInReturnPath(storage, key, "/device", now);
    const later = new Date(now.getTime() + SIGN_IN_RETURN_PATH_LIFETIME_MS + 1);

    expect(takeSignInReturnPath(storage, key, later)).toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });

  it("does not store an unsafe path", () => {
    const storage = memoryStorage();
    expect(rememberSignInReturnPath(storage, key, "//evil.example", now)).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it("ignores tampered or broken stored values", () => {
    const storage = memoryStorage();
    storage.setItem(key, JSON.stringify({ path: "https://evil.example", savedAt: now.getTime() }));
    expect(takeSignInReturnPath(storage, key, now)).toBeNull();
    storage.setItem(key, "{");
    expect(takeSignInReturnPath(storage, key, now)).toBeNull();
  });

  it("keeps working when storage is blocked", () => {
    const blocked = {
      getItem(): string | null {
        throw new Error("blocked");
      },
      setItem(): void {
        throw new Error("blocked");
      },
      removeItem(): void {
        throw new Error("blocked");
      },
    };
    expect(rememberSignInReturnPath(blocked, key, "/device", now)).toBe(false);
    expect(takeSignInReturnPath(blocked, key, now)).toBeNull();
    expect(() => forgetSignInReturnPath(blocked, key)).not.toThrow();
    expect(rememberSignInReturnPath(null, key, "/device", now)).toBe(false);
  });
});
