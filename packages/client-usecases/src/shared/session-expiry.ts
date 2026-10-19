import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";

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
  return new Proxy(api, {
    get(node, key, receiver) {
      const value = Reflect.get(node, key, receiver);
      // サインインの途中の失敗で手元の状態を消さないよう、auth は包まない
      if (key === "auth" || value == null || typeof value !== "object") {
        return value;
      }
      return wrapNode(value as object, hooks);
    },
  });
}

function wrapNode<T extends object>(target: T, hooks: SessionExpiryHooks): T {
  return new Proxy(target, {
    get(node, key, receiver) {
      const value = Reflect.get(node, key, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const authVersion = hooks.captureAuthVersion();
          const result = (value as (...a: unknown[]) => unknown).apply(
            node,
            args,
          );
          if (result instanceof Promise) {
            return result.catch((error: unknown) => {
              if (isSessionExpiredError(error)) {
                hooks.expireIfAuthUnchangedSince(authVersion);
              }
              throw error;
            });
          }
          return result;
        };
      }
      if (value != null && typeof value === "object") {
        return wrapNode(value as object, hooks);
      }
      return value;
    },
  });
}
