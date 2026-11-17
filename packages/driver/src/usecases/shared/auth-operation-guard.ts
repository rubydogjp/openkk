import { AppError } from "../../domain/index.js";

import type { AsyncStateVersion } from "./async-state-version.js";

export function assertAuthUnchanged(
  versions: AsyncStateVersion,
  expectedVersion: number,
): void {
  if (versions.isCurrent(expectedVersion)) return;
  throw new AppError({
    messageForDeveloper: "Authentication operation was superseded",
    messageForUser:
      "サインインの状態が変わったため、操作を取りやめました。もう一度試してください",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
