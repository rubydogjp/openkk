import { describe, expect, it } from "vitest";

import { backupFailedFor } from "./book-save-button.js";

describe("backupFailedFor", () => {
  it("shows a failed backup only in the period it failed in", () => {
    expect(backupFailedFor("fp-1", "fp-1")).toBe(true);
    expect(backupFailedFor("fp-1", "fp-2")).toBe(false);
    expect(backupFailedFor(null, "fp-1")).toBe(false);
  });
});
