import { describe, expect, it } from "vitest";

import { fixedAssetsReplacedByCarryover } from "./opening-carryover.js";

describe("fixedAssetsReplacedByCarryover", () => {
  it("replaces only the assets bought before the period starts", () => {
    expect(
      fixedAssetsReplacedByCarryover(
        [
          { name: "前の年の車", acquisitionDate: "2025-06-01" },
          { name: "期首の日に買った机", acquisitionDate: "2026-01-01" },
          { name: "今年のPC", acquisitionDate: "2026-03-15" },
        ],
        { startDate: "2026-01-01" },
      ).map((asset) => asset.name),
    ).toEqual(["前の年の車"]);
  });
});
