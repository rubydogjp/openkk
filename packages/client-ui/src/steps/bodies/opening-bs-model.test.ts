import { describe, expect, it } from "vitest";

import {
  buildInitialAmounts,
  buildLiabilityLabels,
  parseOpeningAmount,
  sumOpeningAmounts,
  unrenderedOpeningLines,
} from "./opening-bs-model.js";

describe("buildLiabilityLabels", () => {
  it("shows non-standard opening liabilities in otherwise blank rows", () => {
    const labels = buildLiabilityLabels([
      { accountId: "l:未払費用" },
      { accountId: "l:前受収益" },
      { accountId: "l:未払費用" },
      { accountId: "l:借入金" },
      { accountId: "a:敷金" },
    ]);

    expect(labels).toEqual(expect.arrayContaining(["未払費用", "前受収益"]));
    expect(labels.filter((label) => label === "未払費用")).toHaveLength(1);
    expect(labels.filter((label) => label === "借入金")).toHaveLength(1);
    expect(labels).not.toContain("敷金");
  });

  it("uses the same extra rows as the financial statements", () => {
    const lines = Array.from({ length: 15 }, (_, index) => ({
      accountId: `l:任意負債${index + 1}`,
      amount: 1,
    }));

    const labels = buildLiabilityLabels(lines);

    expect(labels.filter((label) => label.startsWith("任意負債"))).toHaveLength(
      13,
    );
    expect(labels).toContain("任意負債13");
    expect(
      unrenderedOpeningLines(lines, [], labels).map((line) => line.accountId),
    ).toEqual(["l:任意負債14", "l:任意負債15"]);
  });
});

describe("buildInitialAmounts", () => {
  it("merges related accounts into their balance sheet rows", () => {
    expect(
      buildInitialAmounts([
        { accountId: "a:普通預金", amount: 100 },
        { accountId: "a:その他の預金", amount: 20 },
        { accountId: "a:商品", amount: 30 },
        { accountId: "a:前払費用", amount: 40 },
        { accountId: "l:長期借入金", amount: 50 },
        { accountId: "l:借入金", amount: 5 },
        { accountId: "a:敷金", amount: 60 },
      ]),
    ).toEqual({
      "a:その他の預金": "120",
      "a:棚卸資産": "30",
      "a:前払金": "40",
      "l:借入金": "55",
      "a:敷金": "60",
    });
  });

  it("does not leave merged accounts to be saved separately", () => {
    expect(
      unrenderedOpeningLines(
        [
          { accountId: "a:商品", amount: 30 },
          { accountId: "l:長期借入金", amount: 50 },
        ],
        [],
        [],
      ),
    ).toEqual([]);
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
