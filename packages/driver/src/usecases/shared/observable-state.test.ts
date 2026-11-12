import { describe, expect, it } from "vitest";

import { createWritableState, deriveState } from "./observable-state.js";

describe("createWritableState", () => {
  it("notifies listeners once per changed value", () => {
    const state = createWritableState(1);
    const seen: number[] = [];
    state.subscribe(() => seen.push(state.getState()));

    state.setState(2);
    state.setState(2);
    state.setState(3);

    expect(seen).toEqual([2, 3]);
  });

  it("stops notifying after unsubscribe", () => {
    const state = createWritableState("a");
    const seen: string[] = [];
    const unsubscribe = state.subscribe(() => seen.push(state.getState()));

    state.setState("b");
    unsubscribe();
    state.setState("c");

    expect(seen).toEqual(["b"]);
  });

  it("lets a listener unsubscribe another listener while notifying", () => {
    const state = createWritableState(0);
    const seen: string[] = [];
    const unsubscribeSecond = state.subscribe(() => seen.push("second"));
    state.subscribe(() => {
      seen.push("third");
      unsubscribeSecond();
    });

    state.setState(1);
    state.setState(2);

    expect(seen).toEqual(["second", "third", "third"]);
  });
});

describe("deriveState", () => {
  it("keeps the derived value until the source changes", () => {
    const source = createWritableState({ count: 1 });
    const derived = deriveState(source, (value) => ({
      doubled: value.count * 2,
    }));

    const first = derived.getState();
    expect(derived.getState()).toBe(first);

    source.setState({ count: 2 });
    expect(derived.getState()).toEqual({ doubled: 4 });
    expect(derived.getState()).not.toBe(first);
  });

  it("notifies through the source", () => {
    const source = createWritableState(1);
    const derived = deriveState(source, (value) => value + 1);
    const seen: number[] = [];
    derived.subscribe(() => seen.push(derived.getState()));

    source.setState(5);

    expect(seen).toEqual([6]);
  });
});
