import { describe, expect, it } from "vitest";

import { AppError } from "./app-error.js";

describe("server AppError", () => {
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

    expect(error).toMatchObject(dto);
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
