import { describe, expect, it } from "vitest";

import { formatCalendarDate } from "./calendar-date.js";

describe("formatCalendarDate", () => {
  it("uses the requested local calendar date across a UTC boundary", () => {
    const timestamp = "2026-09-04T15:30:00.000Z";

    expect(formatCalendarDate(timestamp, "Asia/Tokyo")).toBe("2026-09-05");
    expect(formatCalendarDate(timestamp, "UTC")).toBe("2026-09-04");
  });

  it("retains invalid input for diagnosis", () => {
    expect(formatCalendarDate("invalid", null)).toBe("invalid");
  });
});
