import { describe, expect, it } from "vitest";

import { parseAmount, parseBusinessRate, parseIsoLocalDate } from "./parse-utils";

describe("parseAmount", () => {
  it("treats non-finite numeric amounts as zero", () => {
    expect(parseAmount(Infinity)).toBe(0);
    expect(parseAmount(-Infinity)).toBe(0);
  });
});

describe("parseBusinessRate", () => {
  it("treats non-finite rates as the default full business rate", () => {
    expect(parseBusinessRate("Infinity")).toBe(1);
    expect(parseBusinessRate("-Infinity")).toBe(1);
  });
});

describe("parseIsoLocalDate", () => {
  it("parses YYYY-MM-DD as a local calendar date", () => {
    const date = parseIsoLocalDate("2026-01-01");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(0);
    expect(date?.getDate()).toBe(1);
    expect(date?.getDay()).toBe(4);
  });

  it("rejects non-ISO date strings", () => {
    expect(parseIsoLocalDate("2026/01/01")).toBeNull();
    expect(parseIsoLocalDate("")).toBeNull();
  });

  it("rejects invalid calendar dates", () => {
    expect(parseIsoLocalDate("2026-02-29")).toBeNull();
    expect(parseIsoLocalDate("2026-13-01")).toBeNull();
  });
});
