import { describe, expect, it } from "vitest";

import { createFixedClock, createSystemClock } from "./openkk-config.js";

describe("OpenkkClock", () => {
  it("reads the current date each time from a system clock", () => {
    let current = new Date(2026, 8, 5, 23, 59);
    const clock = createSystemClock(() => current);

    expect(clock.today().getDate()).toBe(5);
    current = new Date(2026, 8, 6, 0, 1);
    expect(clock.today().getDate()).toBe(6);
  });

  it("returns independent copies of a fixed date", () => {
    const clock = createFixedClock(new Date(2026, 8, 5));
    const first = clock.today();
    first.setDate(10);

    expect(clock.today()).toEqual(new Date(2026, 8, 5));
  });
});
