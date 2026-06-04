import { describe, expect, it } from "vitest";

import { formatDateButtonLabel, isoDateToWeekday } from "./date-picker";

describe("date-picker date formatting", () => {
  it("formats ISO dates using the local calendar weekday", () => {
    expect(formatDateButtonLabel("2026-01-01")).toBe("2026/01/01 (木)");
    expect(isoDateToWeekday("2026-01-01")).toBe("木");
  });

  it("rejects invalid calendar dates instead of rolling them over", () => {
    expect(formatDateButtonLabel("2026-02-29")).toBe("2026-02-29");
    expect(isoDateToWeekday("2026-02-29")).toBe("");
  });
});
