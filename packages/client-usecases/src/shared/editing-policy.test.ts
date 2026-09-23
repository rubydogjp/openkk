import { describe, expect, it } from "vitest";
import {
  AppError,
  DEFAULT_EDITING_POLICY,
} from "@rubydogjp/openkk-client-domain";

import { assertEditingUnlocked } from "./editing-policy.js";

describe("assertEditingUnlocked", () => {
  it("allows mutations when editing is not locked", () => {
    expect(() =>
      assertEditingUnlocked(DEFAULT_EDITING_POLICY, "entries.create"),
    ).not.toThrow();
  });

  it("rejects mutations with the configured notice when locked", () => {
    try {
      assertEditingUnlocked(
        { locked: true, lockedNotice: "閲覧専用です" },
        "entries.create",
      );
      throw new Error("expected editing lock error");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).messageForUser).toBe("閲覧専用です");
    }
  });
});
