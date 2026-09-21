import { AppError } from "@rubydogjp/openkk-client-domain";

import { AsyncStateVersion } from "./async-state-version.js";

const AUTH = "auth";

export class AuthOperationGuard {
  readonly #versions = new AsyncStateVersion<typeof AUTH>();

  capture(): number {
    return this.#versions.capture(AUTH);
  }

  invalidate(): number {
    return this.#versions.invalidate(AUTH);
  }

  isCurrent(expectedVersion: number): boolean {
    return this.#versions.isCurrent(AUTH, expectedVersion);
  }

  assertCurrent(expectedVersion: number): void {
    if (this.isCurrent(expectedVersion)) return;
    throw new AppError({
      messageForDeveloper: "Authentication operation was superseded",
      messageForUser: "認証状態が変わったため、処理を中止しました",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
}
