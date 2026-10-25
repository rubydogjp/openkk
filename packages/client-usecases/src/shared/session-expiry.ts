import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";

import { observeRejectedCalls } from "./observe-rejected-calls.js";

export function isSessionExpiredError(error: unknown): boolean {
  if (typeof error !== "object" || error == null) return false;
  return (error as Record<string, unknown>).statusCode === 401;
}

export type SessionExpiryHooks = {
  captureAuthVersion: () => number;
  expireIfAuthUnchangedSince: (authVersion: number) => void;
};

export function wrapWithSessionExpiry(
  api: OpenkkBackendPort,
  hooks: SessionExpiryHooks,
): OpenkkBackendPort {
  return observeRejectedCalls(api, ([apiName]) => {
    if (apiName === "auth") return null;
    const authVersion = hooks.captureAuthVersion();
    return (error) => {
      if (isSessionExpiredError(error)) {
        hooks.expireIfAuthUnchangedSince(authVersion);
      }
    };
  });
}
