import { describe, expect, it } from "vitest";

import {
  isMaintenanceModeError,
  openkkHttpTransportError,
  resolveOpenkkHttpResponse,
} from "./http-response";
import { MAINTENANCE_MODE_ERROR_CODE } from "./types";

describe("resolveOpenkkHttpResponse", () => {
  it("returns the response body only for the endpoint success status", () => {
    expect(
      resolveOpenkkHttpResponse("fiscalPeriodCreate", {
        status: 201,
        body: { fiscalPeriod: { id: "fp-1" } },
      }),
    ).toEqual({ fiscalPeriod: { id: "fp-1" } });
  });

  it("rejects a different successful HTTP status as a protocol error", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("fiscalPeriodCreate", {
        status: 200,
        body: { fiscalPeriod: { id: "fp-1" } },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "fiscalPeriodCreate expected HTTP 201 but received 200",
      messageForUser: "バックエンドから不正な応答を受信しました",
      statusCode: 200,
    });
  });

  it("preserves an AppError response body and trusts the HTTP status", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("fiscalPeriodPatch", {
        status: 409,
        body: {
          messageForDeveloper: "archived period",
          messageForUser: "圧縮保存済みです",
          originalMessage: null,
          statusCode: 400,
        },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper: "archived period",
      messageForUser: "圧縮保存済みです",
      originalMessage: null,
      statusCode: 409,
    });
  });

  it("preserves a structured AppError body for HTTP 500", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 500,
        body: {
          messageForDeveloper: "database unavailable",
          messageForUser: "データを読み込めませんでした",
          originalMessage: null,
          statusCode: 500,
        },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper: "database unavailable",
      messageForUser: "データを読み込めませんでした",
      statusCode: 500,
    });
  });

  it("creates a safe AppError when HTTP 500 has no error body", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 500,
        body: undefined,
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "entriesGetAll returned HTTP 500 without OpenkkApiErrorDto",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: null,
      statusCode: 500,
    });
  });

  it("does not trust a malformed error response body", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 503,
        body: { message: "temporarily unavailable" },
      }),
    );
    expect(error).toMatchObject({
      messageForDeveloper:
        "entriesGetAll returned HTTP 503 without OpenkkApiErrorDto",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: '{"message":"temporarily unavailable"}',
      statusCode: 503,
    });
  });
});

describe("isMaintenanceModeError", () => {
  it("detects the maintenance error code preserved on a thrown envelope", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 503,
        body: {
          messageForDeveloper: "service in maintenance",
          messageForUser: "メンテナンス中です",
          originalMessage: null,
          statusCode: 503,
          code: MAINTENANCE_MODE_ERROR_CODE,
        },
      }),
    );
    expect(isMaintenanceModeError(error)).toBe(true);
  });

  it("ignores unrelated server errors", () => {
    const error = captureError(() =>
      resolveOpenkkHttpResponse("entriesGetAll", {
        status: 500,
        body: {
          messageForDeveloper: "database unavailable",
          messageForUser: "データを読み込めませんでした",
          originalMessage: null,
          statusCode: 500,
        },
      }),
    );
    expect(isMaintenanceModeError(error)).toBe(false);
  });

  it("falls back to a 503 whose developer message names the code", () => {
    expect(
      isMaintenanceModeError({
        statusCode: 503,
        messageForDeveloper: `aborted by ${MAINTENANCE_MODE_ERROR_CODE}`,
      }),
    ).toBe(true);
  });
});

describe("openkkHttpTransportError", () => {
  it("distinguishes failures that have no HTTP response", () => {
    expect(openkkHttpTransportError(new Error("network offline"))).toEqual({
      messageForDeveloper:
        "OpenKK HTTP transport failed before receiving a response",
      messageForUser: "サーバーに接続できませんでした",
      originalMessage: "network offline",
      statusCode: null,
    });
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}
