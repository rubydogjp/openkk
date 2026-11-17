import { describe, expect, it } from "vitest";

import {
  canApplyCarryover,
  isDayBefore,
  reversalCandidatesMessage,
} from "./opening-bs-carryover.js";

const TRANSFER_ONLY = { bs: false, transfer: true, fixed: false };

describe("reversal candidates of a carryover", () => {
  it("does not say there are no candidates while they are loading or failed to load", () => {
    expect(reversalCandidatesMessage({ kind: "loading" }, 0)).toBe(
      "候補の仕訳を読み込んでいます",
    );
    expect(reversalCandidatesMessage({ kind: "failed" }, 0)).toBe(
      "候補の仕訳を読み込めませんでした",
    );
    expect(reversalCandidatesMessage({ kind: "loaded", entries: [] }, 0)).toBe(
      "候補の仕訳はありません",
    );
  });

  it("does not let the reversal journals be overwritten before the candidates are loaded", () => {
    expect(canApplyCarryover(TRANSFER_ONLY, { kind: "loading" })).toBe(false);
    expect(canApplyCarryover(TRANSFER_ONLY, { kind: "failed" })).toBe(false);
    expect(
      canApplyCarryover(TRANSFER_ONLY, { kind: "loaded", entries: [] }),
    ).toBe(true);
    expect(
      canApplyCarryover(
        { bs: true, transfer: false, fixed: false },
        { kind: "loading" },
      ),
    ).toBe(true);
  });
});

describe("carryover sources", () => {
  it("offers only the period that ends the day before the target starts", () => {
    expect(isDayBefore("2025-12-31", "2026-01-01")).toBe(true);
    expect(isDayBefore("2024-02-28", "2024-02-29")).toBe(true);
    expect(isDayBefore("2024-12-31", "2026-01-01")).toBe(false);
    expect(isDayBefore("2025-12-30", "2026-01-01")).toBe(false);
  });
});
