import { describe, expect, it } from "vitest";

import { showsEntriesSheet } from "./entries-view.js";

function searchParams(query: string) {
  return new URLSearchParams(query);
}

describe("showsEntriesSheet", () => {
  it("shows the sheet only on the entries path with the sheet view", () => {
    expect(showsEntriesSheet("/entries", searchParams("view=sheet"))).toBe(
      true,
    );
    expect(
      showsEntriesSheet("/entries", searchParams("month=2026-05&view=sheet")),
    ).toBe(true);
  });

  it("keeps the monthly screen for any other path or view", () => {
    expect(showsEntriesSheet("/entries", searchParams(""))).toBe(false);
    expect(showsEntriesSheet("/entries", searchParams("view=table"))).toBe(
      false,
    );
    expect(showsEntriesSheet("/steps", searchParams("view=sheet"))).toBe(false);
  });
});
