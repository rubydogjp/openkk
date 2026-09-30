type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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

export function rememberSignInReturnPath(
  storage: StorageLike | null,
  key: string,
  path: string,
  now: Date,
): boolean {
  const normalized = normalizeSignInReturnPath(path);
  if (normalized == null) return false;
  try {
    storage?.setItem(
      key,
      JSON.stringify({ path: normalized, savedAt: now.getTime() }),
    );
    return storage != null;
  } catch {
    return false;
  }
}

export function takeSignInReturnPath(
  storage: StorageLike | null,
  key: string,
  now: Date,
): string | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(key) ?? null;
    storage?.removeItem(key);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed == null) return null;
    const { path, savedAt } = parsed as Record<string, unknown>;
    if (typeof savedAt !== "number") return null;
    const age = now.getTime() - savedAt;
    if (age < 0 || age > SIGN_IN_RETURN_PATH_LIFETIME_MS) return null;
    return normalizeSignInReturnPath(path);
  } catch {
    return null;
  }
}

export function forgetSignInReturnPath(
  storage: StorageLike | null,
  key: string,
): void {
  try {
    storage?.removeItem(key);
  } catch {}
}
