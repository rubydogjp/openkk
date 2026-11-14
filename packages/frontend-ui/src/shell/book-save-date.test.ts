import { describe, expect, it } from "vitest";

import { bookSaveStatusLabel, formatBookSaveDate } from "./book-save-date.js";

const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).getTime();

describe("book save date", () => {
  it("shows month and day within the same year", () => {
    expect(formatBookSaveDate(at(2026, 11, 3), at(2026, 11, 11))).toBe("11/3");
  });

  it("adds the year when the save was in another year", () => {
    expect(formatBookSaveDate(at(2025, 12, 28), at(2026, 1, 5))).toBe(
      "2025/12/28",
    );
  });

  it("tells about unsaved changes before the last save date", () => {
    expect(
      bookSaveStatusLabel(
        { hasUnsavedChanges: true, lastSavedAt: at(2026, 11, 3) },
        at(2026, 11, 11),
      ),
    ).toBe("バックアップしていない変更があります");
    expect(
      bookSaveStatusLabel(
        { hasUnsavedChanges: false, lastSavedAt: at(2026, 11, 3) },
        at(2026, 11, 11),
      ),
    ).toBe("前回 11/3");
  });
});
