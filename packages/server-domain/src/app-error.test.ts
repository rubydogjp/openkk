import { describe, expect, it } from "vitest";

import { AppError } from "./app-error.js";

describe("server AppError", () => {
  it("round-trips through the API error DTO shape", () => {
    const error = new AppError({
      messageForDeveloper: "developer detail",
      messageForUser: "ユーザー向け",
      originalMessage: "raw failure",
      statusCode: 400,
      code: null,
    });

    expect(AppError.fromJson(error.toJson()).toJson()).toEqual({
      messageForDeveloper: "developer detail",
      messageForUser: "ユーザー向け",
      originalMessage: "raw failure",
      statusCode: 400,
      code: null,
    });
  });

  it("keeps structurally compatible API error DTOs", () => {
    const dto = {
      messageForDeveloper: "remote validation failed",
      messageForUser: "入力内容を確認してください",
      originalMessage: null,
      statusCode: 400,
      code: null,
    };

    const error = AppError.from(dto, {
      fallbackUserMessage: null,
      fallbackDeveloperMessage: null,
      statusCode: null,
    });

    expect(error.toJson()).toEqual(dto);
  });

  it("rejects malformed API error JSON", () => {
    expect(() =>
      AppError.fromJson({
        messageForUser: "missing developer message",
        originalMessage: null,
        statusCode: 400,
      }),
    ).toThrow(/invalid AppError JSON/);
  });

  it("normalizes malformed constructor fields", () => {
    const error = new AppError({
      messageForDeveloper: undefined,
      messageForUser: undefined,
      originalMessage: undefined,
      statusCode: Number.NaN,
      code: undefined,
    } as unknown as ConstructorParameters<typeof AppError>[0]);

    expect(error.toJson()).toEqual({
      messageForDeveloper: "Server AppError: invalid developer message",
      messageForUser: "サーバー処理でエラーが発生しました",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  });

  it("wraps circular objects without throwing a second error", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      AppError.from(circular, {
        fallbackUserMessage: null,
        fallbackDeveloperMessage: null,
        statusCode: null,
      }).originalMessage,
    ).toBe("<unprintable>");
  });
});
