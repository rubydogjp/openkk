import { describe, expect, it } from "vitest";

import {
  masterSetSwitchBody,
  masterSetSwitchTarget,
} from "./master-set-row.js";

const SETS = [
  { id: "jp-2026", name: "2026年版", effectiveFrom: "2000-01-01" },
  { id: "jp-2028", name: "2028年版", effectiveFrom: "2028-01-01" },
];

const PERIOD_2028 = {
  phase: "journalizing" as const,
  startDate: "2028-01-01",
  masterSetId: "jp-2026",
};

describe("switching the version of accounts and categories", () => {
  it("offers the newer version before pre-closing", () => {
    for (const phase of ["pre_opening", "journalizing"] as const) {
      expect(
        masterSetSwitchTarget({ ...PERIOD_2028, phase }, SETS, false)?.id,
      ).toBe("jp-2028");
    }
  });

  it("offers nothing after pre-closing, while editing is locked, or when no newer version is in effect", () => {
    for (const phase of ["pre_closing", "post_closing"] as const) {
      expect(
        masterSetSwitchTarget({ ...PERIOD_2028, phase }, SETS, false),
      ).toBeNull();
    }
    expect(masterSetSwitchTarget(PERIOD_2028, SETS, true)).toBeNull();
    expect(
      masterSetSwitchTarget(
        { ...PERIOD_2028, startDate: "2027-01-01" },
        SETS,
        false,
      ),
    ).toBeNull();
    expect(
      masterSetSwitchTarget(PERIOD_2028, SETS.slice(0, 1), false),
    ).toBeNull();
  });

  it("says the entries stay and what shows as custom", () => {
    expect(masterSetSwitchBody(SETS[1]!)).toEqual([
      "仕訳はそのままです。2028年版にない科目や区分は「カスタム(…)」と出ます。",
    ]);
  });
});
