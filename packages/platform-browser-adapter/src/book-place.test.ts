import { describe, expect, it } from "vitest";

import { isBookFileName, uniqueBookName } from "./book-place.js";
import {
  PENDING_COPY_SUFFIX,
  READY_MARK_SUFFIX,
} from "./in-app-book-protocol.js";

const BOOK = "2026年分.openkk";

function stored(name: string) {
  return { name, size: 1, lastModified: 1 };
}

describe("book place", () => {
  it("treats only .openkk files as books, not the recovery files beside them", () => {
    expect(isBookFileName(BOOK)).toBe(true);
    expect(isBookFileName(`${BOOK}${PENDING_COPY_SUFFIX}`)).toBe(false);
    expect(isBookFileName(`${BOOK}${READY_MARK_SUFFIX}`)).toBe(false);
    expect(isBookFileName("notes.txt")).toBe(false);
  });

  it("names a new book after the period and numbers it when the name is taken", () => {
    expect(uniqueBookName("2026年分", [])).toBe(BOOK);
    expect(uniqueBookName(BOOK, [stored("2025年分.openkk")])).toBe(BOOK);
    expect(
      uniqueBookName("2026年分", [stored(BOOK), stored("2026年分 (2).openkk")]),
    ).toBe("2026年分 (3).openkk");
  });
});
