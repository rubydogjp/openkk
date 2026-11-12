import { AppError } from "@rubydogjp/openkk-driver";

export function safeUserErrorMessage(
  error: unknown,
  fallbackUserMessage: string | null,
): string {
  return AppError.from(error, {
    fallbackUserMessage,
    fallbackDeveloperMessage: null,
    statusCode: null,
  }).messageForUser;
}
