import { describe, expect, it } from "vitest";

import { bookFileName, isBookFileName } from "./book-file-format.js";

describe("book file name", () => {
  it("uses the fiscal period name", () => {
    expect(bookFileName("2026年分")).toBe("2026年分.openkk");
  });

  it("replaces characters a file name cannot hold", () => {
    expect(bookFileName('2026/27 <決算>: "本番"?*|\\')).toBe(
      "2026_27 _決算__ _本番_____.openkk",
    );
  });

  it("drops leading dots and trailing dots and spaces", () => {
    expect(bookFileName("..2026年分. ")).toBe("2026年分.openkk");
  });

  it("falls back to a fixed name when nothing is left", () => {
    expect(bookFileName(" . ")).toBe("帳簿.openkk");
  });

  it("recognizes book files by their extension", () => {
    expect(isBookFileName("a.openkk")).toBe(true);
    expect(isBookFileName("a.openkk.next")).toBe(false);
  });
});
