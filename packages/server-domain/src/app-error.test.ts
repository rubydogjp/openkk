import { describe, expect, it } from "vitest";

import { AppError } from "./app-error";

describe("server AppError", () => {
  it("round-trips through the API error DTO shape", () => {
    const error = new AppError({
      messageForDeveloper: "developer detail",
      messageForUser: "ユーザー向け",
      originalMessage: "raw failure",
      statusCode: 400,
    });

    expect(AppError.fromJson(error.toJson()).toJson()).toEqual({
      messageForDeveloper: "developer detail",
      messageForUser: "ユーザー向け",
      originalMessage: "raw failure",
      statusCode: 400,
    });
  });

  it("keeps structurally compatible API error DTOs", () => {
    const dto = {
      messageForDeveloper: "remote validation failed",
      messageForUser: "入力内容を確認してください",
      originalMessage: null,
      statusCode: 400,
    };

    const error = AppError.from(dto);

    expect(error.toJson()).toEqual(dto);
  });
});
