import type { OpenkkUser } from "@rubydogjp/openkk-client-domain";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function safeStorageGet(
  storage: StorageLike | null,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSet(
  storage: StorageLike | null,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value);
  } catch {}
}

export function safeStorageRemove(
  storage: StorageLike | null,
  key: string,
): void {
  try {
    storage?.removeItem(key);
  } catch {}
}

export function readStoredUser(raw: string | null): OpenkkUser | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.kind !== "custom" ||
      typeof parsed.id !== "string" ||
      parsed.id.trim() === ""
    ) {
      return null;
    }
    return {
      kind: "custom",
      id: parsed.id,
      displayName:
        typeof parsed.displayName === "string" &&
        parsed.displayName.trim() !== ""
          ? parsed.displayName
          : parsed.id,
      email:
        typeof parsed.email === "string" && parsed.email.trim() !== ""
          ? parsed.email.trim()
          : null,
      iconUrl:
        parsed.iconUrl === null || isSafeStoredHttpUrl(parsed.iconUrl)
          ? parsed.iconUrl
          : null,
      authProvider:
        typeof parsed.authProvider === "string" &&
        parsed.authProvider.trim() !== ""
          ? parsed.authProvider
          : "custom",
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isSafeStoredHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
