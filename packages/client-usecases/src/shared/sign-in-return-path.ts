import type { PlatformKeyValueStorage } from "@rubydogjp/openkk-client-ports";

export const SIGN_IN_RETURN_PATH_LIFETIME_MS = 15 * 60 * 1000;
const MAX_RETURN_PATH_LENGTH = 2048;
const PARSE_BASE = "https://openkk.invalid";

export function normalizeSignInReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_RETURN_PATH_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== PARSE_BASE) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export type SignInReturnPathStore = {
  remember(path: string, now: Date): boolean;
  take(now: Date): string | null;
  forget(): void;
};

export function createSignInReturnPathStore(
  storage: PlatformKeyValueStorage,
  sessionStorageKey: string,
): SignInReturnPathStore {
  const key = `${sessionStorageKey}.sign_in_return_path`;
  return {
    remember(path, now) {
      const normalized = normalizeSignInReturnPath(path);
      if (normalized == null) return false;
      storage.setItem(
        key,
        JSON.stringify({ path: normalized, savedAt: now.getTime() }),
      );
      return true;
    },
    take(now) {
      const raw = storage.getItem(key);
      storage.removeItem(key);
      return raw == null ? null : parseStoredReturnPath(raw, now);
    },
    forget() {
      storage.removeItem(key);
    },
  };
}

function parseStoredReturnPath(raw: string, now: Date): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed == null) return null;
  const { path, savedAt } = parsed as Record<string, unknown>;
  if (typeof savedAt !== "number") return null;
  const age = now.getTime() - savedAt;
  if (age < 0 || age > SIGN_IN_RETURN_PATH_LIFETIME_MS) return null;
  return normalizeSignInReturnPath(path);
}
