import { describe, expect, it } from "vitest";
import { AppError } from "@rubydogjp/openkk-client-domain";

import { assertEditingUnlocked } from "./editing-policy.js";

describe("assertEditingUnlocked", () => {
  it("allows mutations when editing is not locked", () => {
    expect(() => assertEditingUnlocked({}, "entries.create")).not.toThrow();
  });

  it("rejects mutations with the configured notice when locked", () => {
    try {
      assertEditingUnlocked(
        { editingPolicy: { locked: true, lockedNotice: "閲覧専用です" } },
        "entries.create",
      );
      throw new Error("expected editing lock error");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).messageForUser).toBe("閲覧専用です");
    }
  });
});
