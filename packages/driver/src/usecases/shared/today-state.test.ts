import { afterEach, describe, expect, it, vi } from "vitest";

import { createFixedClock, createSystemClock } from "../../domain/index.js";
import { createTodayState } from "./today-state.js";

describe("createTodayState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a fixed clock's date without a timer", () => {
    vi.useFakeTimers();
    const today = createTodayState(createFixedClock(new Date(2026, 0, 31)));

    today.start();

    expect(today.getState().getDate()).toBe(31);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("moves to the next day shortly after midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 59, 30));
    const today = createTodayState(createSystemClock());
    const seen: number[] = [];
    today.subscribe(() => seen.push(today.getState().getDate()));
    const stop = today.start();

    vi.advanceTimersByTime(31_000);

    expect(today.getState().getDate()).toBe(1);
    expect(seen.at(-1)).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
