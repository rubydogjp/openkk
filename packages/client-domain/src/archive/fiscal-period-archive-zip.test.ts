import { describe, expect, it } from "vitest";

import { createStoredZip, looksLikeZip } from "./fiscal-period-archive-zip.js";

describe("looksLikeZip", () => {
  it("recognizes a zip by its first bytes", () => {
    const zip = createStoredZip([
      { name: "a.json", bytes: new TextEncoder().encode("{}") },
    ]);

    expect(looksLikeZip(zip.subarray(0, 4))).toBe(true);
    expect(looksLikeZip(createStoredZip([]).subarray(0, 4))).toBe(true);
  });

  it("does not take a SQLite book or a short file for a zip", () => {
    expect(looksLikeZip(new TextEncoder().encode("SQLite format 3"))).toBe(
      false,
    );
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b]))).toBe(false);
    expect(looksLikeZip(new Uint8Array(0))).toBe(false);
  });
});
