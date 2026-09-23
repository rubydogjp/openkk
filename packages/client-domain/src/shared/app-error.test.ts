import { describe, expect, it } from "vitest";

import { AppError } from "./app-error.js";

describe("AppError", () => {
  it("keeps existing client AppError instances", () => {
    const original = new AppError({
      messageForDeveloper: "developer",
      messageForUser: "ユーザー向け",
      originalMessage: null,
      statusCode: 400,
      code: null,
    });

    expect(
      AppError.from(original, {
        fallbackUserMessage: null,
        fallbackDeveloperMessage: null,
        statusCode: null,
      }),
    ).toBe(original);
  });

  it("preserves structurally compatible AppError-like objects", () => {
    const serverSideError = {
      name: "AppError",
      message: "server developer",
      messageForDeveloper: "server developer",
      messageForUser: "サーバー由来の文言",
      originalMessage: "raw",
      statusCode: 409,
      code: "conflict",
    };

    const appError = AppError.from(serverSideError, {
      fallbackUserMessage: "fallback",
      fallbackDeveloperMessage: null,
      statusCode: null,
    });

    expect(appError).toBeInstanceOf(AppError);
    expect(appError.messageForDeveloper).toBe("server developer");
    expect(appError.messageForUser).toBe("サーバー由来の文言");
    expect(appError.originalMessage).toBe("raw");
    expect(appError.statusCode).toBe(409);
    expect(appError.code).toBe("conflict");
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
});
