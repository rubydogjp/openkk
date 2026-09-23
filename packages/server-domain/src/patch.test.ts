import { describe, expect, it } from "vitest";

import { applyPatch } from "./patch.js";

describe("applyPatch", () => {
  const current: { id: string; userId: string; name: string; note: string | null } = {
    id: "a",
    userId: "u",
    name: "old",
    note: null,
  };

  it("applies listed keys and keeps omitted ones", () => {
    expect(applyPatch(current, { name: "new" }, ["name", "note"])).toEqual({
      ...current,
      name: "new",
    });
  });

  it("sets an explicit null", () => {
    const withNote: typeof current = { ...current, note: "x" };
    expect(applyPatch(withNote, { note: null }, ["note"]).note).toBeNull();
  });

  it("ignores keys that are not listed", () => {
    const patch = { name: "new", userId: "other" } as { name: string };
    expect(applyPatch(current, patch, ["name"]).userId).toBe("u");
  });
});
