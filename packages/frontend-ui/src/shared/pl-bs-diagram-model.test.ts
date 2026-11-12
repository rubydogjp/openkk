import { describe, expect, it } from "vitest";

import {
  resolveEquityBlock,
  resolveProfitBlock,
} from "./pl-bs-diagram-model.js";

describe("PL/BS diagram result blocks", () => {
  it("places profit, loss, and zero profit explicitly", () => {
    expect(resolveProfitBlock(100)).toEqual({
      side: "left",
      label: "利益",
      amount: 100,
      tone: "positive",
    });
    expect(resolveProfitBlock(-100)).toEqual({
      side: "right",
      label: "損失",
      amount: -100,
      tone: "negative",
    });
    expect(resolveProfitBlock(0)).toMatchObject({
      side: "left",
      label: "損益",
      amount: 0,
    });
  });

  it("places positive, negative, and zero equity explicitly", () => {
    expect(resolveEquityBlock(100)).toEqual({
      side: "right",
      label: "純資産",
      amount: 100,
      tone: "positive",
    });
    expect(resolveEquityBlock(-100)).toEqual({
      side: "left",
      label: "債務超過",
      amount: -100,
      tone: "negative",
    });
    expect(resolveEquityBlock(0)).toMatchObject({
      side: "right",
      label: "純資産",
      amount: 0,
    });
  });
});
