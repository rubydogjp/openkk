import {
  MAINTENANCE_MODE_ERROR_CODE,
  MAINTENANCE_MODE_STATUS,
  OPENKK_HTTP_ENDPOINTS,
  type OpenkkApiErrorDto,
  type OpenkkHttpEndpointKey,
  type OpenkkHttpEndpointSpecs,
} from "./types.js";
import { isValidSuccessBody } from "./success-response-validation.js";

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
    if (!isValidSuccessBody(key, response.body)) {
      throw {
        messageForDeveloper: `${key} returned a malformed success response`,
        messageForUser: "バックエンドから不正な応答を受信しました",
        originalMessage: summarizeResponseBody(response.body),
        statusCode: response.status,
      } satisfies OpenkkApiErrorDto;
    }
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
    messageForDeveloper:
      "OpenKK HTTP transport failed before receiving a response",
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
    (candidate.statusCode === null || isHttpStatus(candidate.statusCode)) &&
    (candidate.code === undefined ||
      candidate.code === null ||
      typeof candidate.code === "string")
  );
}

export function isMaintenanceModeError(error: unknown): boolean {
  if (typeof error !== "object" || error == null) return false;
  const candidate = error as Record<string, unknown>;
  if (candidate.code === MAINTENANCE_MODE_ERROR_CODE) return true;
  return (
    candidate.statusCode === MAINTENANCE_MODE_STATUS &&
    isMaintenanceMessage(candidate.messageForDeveloper)
  );
}

function isMaintenanceMessage(value: unknown): boolean {
  return (
    typeof value === "string" && value.includes(MAINTENANCE_MODE_ERROR_CODE)
  );
}

function isHttpErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

function isHttpStatus(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  );
}

function summarizeResponseBody(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  return stringifyUnknown(body);
}

function stringifyUnknown(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.length === 0 ? null : truncateSummary(value);
  }
  if (value instanceof Error) {
    return truncateSummary(value.message || value.toString());
  }
  try {
    const serialized = JSON.stringify(toBoundedSummaryValue(value));
    return serialized === undefined ? null : truncateSummary(serialized);
  } catch {
    try {
      return truncateSummary(String(value));
    } catch {
      return "[unserializable response body]";
    }
  }
}

function toBoundedSummaryValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let remainingNodes = 100;
  const visit = (current: unknown, depth: number): unknown => {
    if (typeof current === "string") {
      return current.length <= 500 ? current : `${current.slice(0, 500)}…`;
    }
    if (
      current == null ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      return current;
    }
    if (typeof current !== "object") return String(current);
    if (seen.has(current)) return "[circular]";
    if (depth >= 4 || remainingNodes <= 0) return "[truncated]";
    seen.add(current);
    remainingNodes -= 1;
    if (Array.isArray(current)) {
      const result = current.slice(0, 20).map((item) => visit(item, depth + 1));
      if (current.length > 20) {
        result.push(`[${current.length - 20} more items]`);
      }
      return result;
    }
    const result: Record<string, unknown> = {};
    const keys = Object.keys(current);
    for (const key of keys.slice(0, 20)) {
      result[key] = visit(
        (current as Record<string, unknown>)[key],
        depth + 1,
      );
    }
    if (keys.length > 20) result["…"] = `${keys.length - 20} more keys`;
    return result;
  };
  return visit(value, 0);
}

const MAX_RESPONSE_SUMMARY_LENGTH = 2_000;

function truncateSummary(value: string): string {
  return value.length <= MAX_RESPONSE_SUMMARY_LENGTH
    ? value
    : `${value.slice(0, MAX_RESPONSE_SUMMARY_LENGTH)}…`;
}
