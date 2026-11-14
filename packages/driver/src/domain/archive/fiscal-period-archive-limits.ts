import { AppError } from "../shared/app-error.js";

export const MAX_FISCAL_PERIOD_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES = 32 * 1024 * 1024;

export function invalidArchiveContentError(
  messageForDeveloper: string,
): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser: "圧縮済みファイルの内容を確認できませんでした。",
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}
