import { describe, expect, it } from "vitest";

import {
  amountInputValue,
  formatAmountText,
  formatGrouped,
} from "./amount-field.js";

describe("amountInputValue", () => {
  it("keeps a pasted decimal amount as typed so it is not read 100 times larger", () => {
    expect(amountInputValue("12,345.00", false)).toBe("12345.00");
    expect(formatGrouped(amountInputValue("12,345.00", false))).toBe(
      "12345.00",
    );
  });

  it("keeps a minus sign and other characters for the save check to catch", () => {
    expect(amountInputValue("-500", false)).toBe("-500");
    expect(amountInputValue("500円", false)).toBe("500円");
  });

  it("turns full-width digits into ASCII digits once the input is settled", () => {
    expect(amountInputValue("１２，３４５", false)).toBe("12345");
  });

  it("leaves the text alone while a Japanese input method is composing", () => {
    expect(amountInputValue("１２", true)).toBe("１２");
  });
});

describe("formatGrouped", () => {
  it("groups the digits of a whole amount", () => {
    expect(formatGrouped("1234567")).toBe("1,234,567");
    expect(formatGrouped("1,234")).toBe("1,234");
    expect(formatGrouped("")).toBe("");
  });

  it("does not regroup an amount that is not a whole number", () => {
    expect(formatGrouped("1.5")).toBe("1.5");
    expect(formatGrouped("-500")).toBe("-500");
  });
});

describe("signed amount text", () => {
  it("shows a negative 元入金 with △ and leaves other amounts unsigned", () => {
    expect(formatAmountText("-200000", true)).toBe("△200,000");
    expect(formatAmountText("△200,000", true)).toBe("△200,000");
    expect(formatAmountText("200000", true)).toBe("200,000");
    expect(formatAmountText("", true)).toBe("");
    expect(formatAmountText("-200000", false)).toBe("-200000");
  });
});
