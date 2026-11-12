import type { OpenkkClock } from "../../domain/index.js";
import { createWritableState, type ReadableState } from "./observable-state.js";

const MINIMUM_DELAY_MS = 1_000;
const DELAY_PAST_MIDNIGHT_MS = 50;

export type TodayState = ReadableState<Date> & {
  start(): () => void;
};

export function createTodayState(clock: OpenkkClock): TodayState {
  const today = createWritableState(clock.today());
  return {
    getState: today.getState,
    subscribe: today.subscribe,
    start() {
      today.setState(clock.today());
      if (clock.kind === "fixed") return () => {};

      let timer: ReturnType<typeof setTimeout>;
      const scheduleNextDayUpdate = () => {
        const current = clock.today();
        const nextDate = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() + 1,
        );
        const delay = Math.max(
          MINIMUM_DELAY_MS,
          nextDate.getTime() - current.getTime() + DELAY_PAST_MIDNIGHT_MS,
        );
        timer = setTimeout(() => {
          today.setState(clock.today());
          scheduleNextDayUpdate();
        }, delay);
      };
      scheduleNextDayUpdate();
      return () => clearTimeout(timer);
    },
  };
}
