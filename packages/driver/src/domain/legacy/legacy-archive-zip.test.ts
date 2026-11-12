import { describe, expect, it } from "vitest";

import {
  createStoredZip,
  looksLikeLegacyArchiveZip,
} from "./legacy-archive-zip.js";

describe("looksLikeLegacyArchiveZip", () => {
  it("recognizes a zip by its first bytes", () => {
    const zip = createStoredZip([
      { name: "a.json", bytes: new TextEncoder().encode("{}") },
    ]);

    expect(looksLikeLegacyArchiveZip(zip.subarray(0, 4))).toBe(true);
    expect(looksLikeLegacyArchiveZip(createStoredZip([]).subarray(0, 4))).toBe(
      true,
    );
  });

  it("does not take a SQLite book or a short file for a zip", () => {
    expect(
      looksLikeLegacyArchiveZip(new TextEncoder().encode("SQLite format 3")),
    ).toBe(false);
    expect(looksLikeLegacyArchiveZip(new Uint8Array([0x50, 0x4b]))).toBe(false);
    expect(looksLikeLegacyArchiveZip(new Uint8Array(0))).toBe(false);
  });
});
