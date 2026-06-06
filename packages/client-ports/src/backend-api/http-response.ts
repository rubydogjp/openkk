import {
  OPENKK_HTTP_ENDPOINTS,
  type OpenkkApiErrorDto,
  type OpenkkHttpEndpointKey,
  type OpenkkHttpEndpointSpecs,
} from "./types";

export type OpenkkHttpResponse = {
  status: number;
  body: unknown;
};

export function resolveOpenkkHttpResponse<Key extends OpenkkHttpEndpointKey>(
  key: Key,
  response: OpenkkHttpResponse,
): OpenkkHttpEndpointSpecs[Key]["response"] {
  const endpoint = OPENKK_HTTP_ENDPOINTS[key];
  if (response.status === endpoint.successStatus) {
    return response.body as OpenkkHttpEndpointSpecs[Key]["response"];
  }

  if (isHttpErrorStatus(response.status)) {
    if (isOpenkkApiErrorDto(response.body)) {
      throw {
        ...response.body,
        statusCode: response.status,
      } satisfies OpenkkApiErrorDto;
    }
    throw {
      messageForDeveloper: `${key} returned HTTP ${response.status} without OpenkkApiErrorDto`,
      messageForUser:
        response.status >= 500
          ? "サーバー処理でエラーが発生しました"
          : "リクエストを処理できませんでした",
      originalMessage: summarizeResponseBody(response.body),
      statusCode: response.status,
    } satisfies OpenkkApiErrorDto;
  }

  throw {
    messageForDeveloper: `${key} expected HTTP ${endpoint.successStatus} but received ${response.status}`,
    messageForUser: "バックエンドから不正な応答を受信しました",
    originalMessage: summarizeResponseBody(response.body),
    statusCode: Number.isInteger(response.status) ? response.status : null,
  } satisfies OpenkkApiErrorDto;
}

export function openkkHttpTransportError(error: unknown): OpenkkApiErrorDto {
  if (isOpenkkApiErrorDto(error)) return error;
  return {
    messageForDeveloper: "OpenKK HTTP transport failed before receiving a response",
    messageForUser: "サーバーに接続できませんでした",
    originalMessage: stringifyUnknown(error),
    statusCode: null,
  };
}

export function isOpenkkApiErrorDto(
  value: unknown,
): value is OpenkkApiErrorDto {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.messageForDeveloper === "string" &&
    typeof candidate.messageForUser === "string" &&
    (typeof candidate.originalMessage === "string" ||
      candidate.originalMessage === null) &&
    (typeof candidate.statusCode === "number" ||
      candidate.statusCode === null)
  );
}

function isHttpErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

function summarizeResponseBody(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  return stringifyUnknown(body);
}

function stringifyUnknown(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.length === 0 ? null : value;
  if (value instanceof Error) return value.message || value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
