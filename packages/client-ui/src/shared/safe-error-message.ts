import { AppError } from "@rubydogjp/openkk-client-domain";

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
