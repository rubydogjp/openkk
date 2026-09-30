import type { PlatformKeyValueStorage } from "@rubydogjp/openkk-client-ports";

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const browserStorage: PlatformKeyValueStorage = {
  getItem(key) {
    try {
      return localStorageOrNull()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorageOrNull()?.setItem(key, value);
    } catch {}
  },
  removeItem(key) {
    try {
      localStorageOrNull()?.removeItem(key);
    } catch {}
  },
};
