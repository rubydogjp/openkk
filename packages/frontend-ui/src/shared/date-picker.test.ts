import { describe, expect, it } from "vitest";

import { formatDateButtonLabel, formatSpokenDate } from "./date-picker.js";

describe("date-picker date formatting", () => {
  it("formats ISO dates using the local calendar weekday", () => {
    expect(formatDateButtonLabel("2026-01-01")).toBe("2026/01/01 (木)");
  });

  it("rejects invalid calendar dates instead of rolling them over", () => {
    expect(formatDateButtonLabel("2026-02-29")).toBe("2026-02-29");
  });
});

describe("date-picker spoken date", () => {
  it("reads the chosen date in Japanese for the button name", () => {
    expect(formatSpokenDate("2026-11-17")).toBe("2026年11月17日 (火)");
  });

  it("says nothing is chosen for an invalid date", () => {
    expect(formatSpokenDate("")).toBe("未選択");
  });
});
