import { describe, expect, it } from "vitest";

import { AppError, jsonToAppError } from "./app-error";

describe("AppError", () => {
  it("keeps existing client AppError instances", () => {
    const original = new AppError({
      messageForDeveloper: "developer",
      messageForUser: "ユーザー向け",
      originalMessage: null,
      statusCode: 400,
    });

    expect(AppError.from(original)).toBe(original);
  });

  it("preserves structurally compatible AppError-like objects", () => {
    const serverSideError = {
      name: "AppError",
      message: "server developer",
      messageForDeveloper: "server developer",
      messageForUser: "サーバー由来の文言",
      originalMessage: "raw",
      statusCode: 409,
    };

    const appError = AppError.from(serverSideError, {
      fallbackUserMessage: "fallback",
    });

    expect(appError).toBeInstanceOf(AppError);
    expect(appError.messageForDeveloper).toBe("server developer");
    expect(appError.messageForUser).toBe("サーバー由来の文言");
    expect(appError.originalMessage).toBe("raw");
    expect(appError.statusCode).toBe(409);
  });

  it("uses fallbacks for ordinary errors", () => {
    const appError = AppError.from(new Error("raw failure"), {
      fallbackUserMessage: "fallback user",
      fallbackDeveloperMessage: "fallback developer",
      statusCode: 500,
    });

    expect(appError.messageForDeveloper).toBe("fallback developer");
    expect(appError.messageForUser).toBe("fallback user");
    expect(appError.originalMessage).toBe("raw failure");
    expect(appError.statusCode).toBe(500);
  });

  it("rejects malformed API error JSON", () => {
    const appError = jsonToAppError({
      messageForUser: "missing developer message",
      originalMessage: null,
      statusCode: 400,
    });

    expect(appError.messageForDeveloper).toContain("jsonToAppError.error");
    expect(appError.messageForUser).toBe("エラー情報の解析に失敗しました");
    expect(appError.originalMessage).toContain("invalid AppError JSON");
  });
});
