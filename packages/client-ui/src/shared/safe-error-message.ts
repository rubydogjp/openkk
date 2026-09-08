import { AppError } from "@rubydogjp/openkk-client-domain";

export function safeUserErrorMessage(
  error: unknown,
  fallbackUserMessage = "エラーが発生しました",
): string {
  return AppError.from(error, {
    fallbackUserMessage,
    fallbackDeveloperMessage: null,
    statusCode: null,
  }).messageForUser;
}
