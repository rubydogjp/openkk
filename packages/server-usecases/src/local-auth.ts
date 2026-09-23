import {
  assertNonBlankString,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";

const LOCAL_AUTH_COMPLETION_PREFIX = "local-auth-completion:";
const LOCAL_AUTH_TTL_MS = 10 * 60 * 1000;
export const LOCAL_AUTH_PENDING_LIMIT = 128;

export function createLocalAuthUsecase() {
  const pendingAuthorizations = new Map<string, number>();
  const pendingCompletions = new Map<string, number>();
  const pruneExpired = () => {
    const now = Date.now();
    for (const [key, expiresAt] of pendingAuthorizations) {
      if (expiresAt <= now) pendingAuthorizations.delete(key);
    }
    for (const [key, expiresAt] of pendingCompletions) {
      if (expiresAt <= now) pendingCompletions.delete(key);
    }
  };
  return {
    async startSession(redirectUrl: unknown) {
      assertNonBlankString(redirectUrl, "auth redirect URL");
      let target: URL;
      try {
        target = new URL(redirectUrl);
      } catch {
        throw serverValidationError("auth redirect URL is invalid", null);
      }
      if (
        (target.protocol !== "http:" && target.protocol !== "https:") ||
        target.username !== "" ||
        target.password !== ""
      ) {
        throw serverValidationError("auth redirect URL is not allowed", null);
      }
      pruneExpired();
      const state = crypto.randomUUID();
      const code = crypto.randomUUID();
      setBoundedPendingValue(
        pendingAuthorizations,
        authorizationKey(state, code),
        Date.now() + LOCAL_AUTH_TTL_MS,
      );
      target.searchParams.set("state", state);
      target.searchParams.set("code", code);
      return { authUrl: target.toString() };
    },
    async completeSession(state: unknown, code: unknown) {
      assertNonBlankString(state, "auth state");
      assertNonBlankString(code, "auth code");
      pruneExpired();
      const key = authorizationKey(state, code);
      if (!pendingAuthorizations.delete(key)) {
        throw serverValidationError("auth state or code is invalid or expired", null);
      }
      const completionCode = `${LOCAL_AUTH_COMPLETION_PREFIX}${crypto.randomUUID()}`;
      setBoundedPendingValue(
        pendingCompletions,
        completionCode,
        Date.now() + LOCAL_AUTH_TTL_MS,
      );
      return { completionCode };
    },
    async redeemCompletionCode(completionCode: unknown) {
      assertNonBlankString(completionCode, "auth completion code");
      pruneExpired();
      if (!pendingCompletions.delete(completionCode)) {
        throw serverValidationError("invalid or expired auth completion code", null);
      }
    },
    async signOut() {
      pendingAuthorizations.clear();
      pendingCompletions.clear();
    },
  };
}

function setBoundedPendingValue(
  pending: Map<string, number>,
  key: string,
  expiresAt: number,
): void {
  pending.set(key, expiresAt);
  while (pending.size > LOCAL_AUTH_PENDING_LIMIT) {
    const oldest = pending.keys().next().value;
    if (oldest == null) return;
    pending.delete(oldest);
  }
}

function authorizationKey(state: string, code: string): string {
  return `${state}\u0000${code}`;
}
