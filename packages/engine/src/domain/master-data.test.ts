import { describe, expect, it } from "vitest";

import {
  assertKnownMasterSetId,
  getDefaultBookAccount,
  MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE,
  MASTER_SETS,
  masterSetForStartDate,
  masterSetOnDate,
} from "./master-data.js";

const TWO_SETS = [
  { id: "jp-2026", effectiveFrom: "2000-01-01" },
  { id: "jp-2028", effectiveFrom: "2028-01-01" },
];

describe("master sets", () => {
  it("starts with the version that records without one are read as", () => {
    expect(MASTER_SETS[0]!.id).toBe("jp-2026");
    expect(MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE).toBe("jp-2026");
  });

  it("picks the newest version in effect on the start date", () => {
    expect(masterSetOnDate("2027-12-31", TWO_SETS)?.id).toBe("jp-2026");
    expect(masterSetOnDate("2028-01-01", TWO_SETS)?.id).toBe("jp-2028");
    expect(masterSetOnDate("2030-04-01", TWO_SETS)?.id).toBe("jp-2028");
    expect(masterSetOnDate("1999-01-01", TWO_SETS)?.id).toBe("jp-2026");
    expect(masterSetOnDate("2026-01-01", [])).toBeNull();
    expect(masterSetForStartDate("2026-01-01").id).toBe("jp-2026");
  });

  it("knows only the versions this app carries", () => {
    expect(() => assertKnownMasterSetId("jp-2026")).not.toThrow();
    for (const unknown of ["jp-2099", "", 2026, null]) {
      expect(() => assertKnownMasterSetId(unknown)).toThrow(
        /Unknown master set/,
      );
    }
  });

  it("finds an account of any version by its id", () => {
    expect(getDefaultBookAccount("acct_cash")?.name).toBe("現金");
    expect(getDefaultBookAccount("acct_unknown")).toBeNull();
  });
});
