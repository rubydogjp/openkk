import { describe, expect, it } from "vitest";

import {
  estimateRowHeight,
  estimateWrappedLineCount,
  packItemsIntoPages,
} from "./print-layout.js";

describe("estimateWrappedLineCount", () => {
  it("counts the lines the tax and business categories take in a narrow column", () => {
    expect(
      estimateWrappedLineCount("税区分: 対象外 / 事業区分: 対象外", 75, 10),
    ).toBe(3);
    expect(estimateWrappedLineCount("", 75, 10)).toBe(1);
    expect(estimateWrappedLineCount("通信費", 101, 10)).toBe(1);
  });

  it("wraps long Japanese text by characters and long words by their width", () => {
    expect(estimateWrappedLineCount("あ".repeat(400), 93, 10)).toBe(50);
    expect(estimateWrappedLineCount("W".repeat(80), 93, 10)).toBeGreaterThan(1);
  });
});

describe("packItemsIntoPages", () => {
  const item = (name: string, height: number, keepWithPrevious = false) => ({
    item: name,
    height,
    keepWithPrevious,
  });

  it("starts a new page when the next item does not fit", () => {
    expect(
      packItemsIntoPages([item("a", 40), item("b", 40), item("c", 40)], 100),
    ).toEqual([["a", "b"], ["c"]]);
  });

  it("carries the previous item along so a total never sits alone at the top of a page", () => {
    expect(
      packItemsIntoPages(
        [item("a", 40), item("b", 40), item("total", 30, true)],
        100,
      ),
    ).toEqual([["a"], ["b", "total"]]);
  });

  it("puts an item taller than a page on a page of its own", () => {
    expect(packItemsIntoPages([item("a", 40), item("tall", 300)], 100)).toEqual(
      [["a"], ["tall"]],
    );
  });
});

describe("estimateRowHeight", () => {
  it("takes the tallest cell of the row", () => {
    expect(
      estimateRowHeight(
        [
          { text: "通信費", columnWidth: 101 },
          { text: "税区分: 対象外 / 事業区分: 対象外", columnWidth: 75 },
        ],
        { lineHeight: 13, verticalPadding: 10 },
      ),
    ).toBe(3 * 13 + 10 + 1);
  });
});
