import { describe, expect, it } from "vitest";

import {
  buildLiabilitySlots,
  parseOpeningAmount,
  sumOpeningAmounts,
} from "./opening-bs-model.js";

describe("buildLiabilitySlots", () => {
  it("shows non-standard opening liabilities in otherwise blank rows", () => {
    const slots = buildLiabilitySlots([
      { accountId: "l:未払費用" },
      { accountId: "l:前受収益" },
      { accountId: "l:未払費用" },
      { accountId: "l:借入金" },
      { accountId: "a:敷金" },
    ]);

    expect(slots.filter((slot) => slot.kind === "extra")).toEqual(
      expect.arrayContaining([
        { kind: "extra", label: "未払費用" },
        { kind: "extra", label: "前受収益" },
      ]),
    );
    expect(slots.filter((slot) => slot.label === "未払費用")).toHaveLength(1);
    expect(slots.filter((slot) => slot.label === "借入金")).toHaveLength(1);
  });

  it("uses every blank liability row and leaves overflow for preservation", () => {
    const lines = Array.from({ length: 15 }, (_, index) => ({
      accountId: `l:任意負債${index + 1}`,
    }));

    const slots = buildLiabilitySlots(lines);

    expect(slots.filter((slot) => slot.kind === "extra")).toHaveLength(14);
    expect(slots.some((slot) => slot.label === "任意負債14")).toBe(true);
    expect(slots.some((slot) => slot.label === "任意負債15")).toBe(false);
  });
});

describe("opening balance amount safety", () => {
  it("parses empty and safe integer inputs", () => {
    expect(parseOpeningAmount("")).toBe(0);
    expect(parseOpeningAmount("1,234")).toBe(1234);
  });

  it("rejects unsafe individual amounts and totals", () => {
    expect(parseOpeningAmount("9007199254740993")).toBeNull();
    expect(
      sumOpeningAmounts(["4503599627370496", "4503599627370496"]),
    ).toBeNull();
  });
});
