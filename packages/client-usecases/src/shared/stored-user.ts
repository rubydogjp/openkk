import type { OpenkkUser } from "@rubydogjp/openkk-client-domain";

import { buildCustomUser } from "./custom-user.js";

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
    return buildCustomUser({
      id: parsed.id,
      displayName: stringOrNull(parsed.displayName),
      email: stringOrNull(parsed.email),
      iconUrl: isSafeStoredHttpUrl(parsed.iconUrl) ? parsed.iconUrl : null,
      authProvider: stringOrNull(parsed.authProvider),
    });
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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
