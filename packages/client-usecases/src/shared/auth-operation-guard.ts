import { AppError } from "@rubydogjp/openkk-client-domain";

import type { AsyncStateVersion } from "./async-state-version.js";

export function assertAuthUnchanged(
  versions: AsyncStateVersion,
  expectedVersion: number,
): void {
  if (versions.isCurrent(expectedVersion)) return;
  throw new AppError({
    messageForDeveloper: "Authentication operation was superseded",
    messageForUser: "認証状態が変わったため、処理を中止しました",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
