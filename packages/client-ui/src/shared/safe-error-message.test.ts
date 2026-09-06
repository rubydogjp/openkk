import { describe, expect, it } from "vitest";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { safeUserErrorMessage } from "./safe-error-message.js";

describe("safeUserErrorMessage", () => {
  it("uses the AppError user message", () => {
    expect(
      safeUserErrorMessage(
        new AppError({
          messageForDeveloper: "secret detail",
          messageForUser: "入力を確認してください",
          originalMessage: null,
          statusCode: 400,
        }),
      ),
    ).toBe("入力を確認してください");
  });

  it("hides ordinary and unknown error details", () => {
    expect(safeUserErrorMessage(new Error("database path"), "保存失敗")).toBe(
      "保存失敗",
    );
    expect(safeUserErrorMessage({ secret: "token" }, "削除失敗")).toBe(
      "削除失敗",
    );
  });
});
