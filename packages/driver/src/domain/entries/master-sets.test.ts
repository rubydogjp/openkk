import { describe, expect, it } from "vitest";

import {
  BUILT_IN_MASTER_SETS,
  MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE,
  masterSetForStartDate,
  masterSetName,
  newerMasterSetFor,
} from "./master-sets.js";

const SETS = [
  { id: "jp-2026", name: "2026年版", effectiveFrom: "2000-01-01" },
  { id: "jp-2028", name: "2028年版", effectiveFrom: "2028-01-01" },
];

describe("versions of accounts and categories", () => {
  it("reads records without a version as the first built-in version", () => {
    expect(MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE).toBe("jp-2026");
    expect(BUILT_IN_MASTER_SETS[0]).toEqual({
      id: "jp-2026",
      name: "2026年版",
      effectiveFrom: "2000-01-01",
    });
  });

  it("picks the newest version in effect on a start date", () => {
    expect(masterSetForStartDate("2027-06-01", SETS)?.id).toBe("jp-2026");
    expect(masterSetForStartDate("2028-01-01", SETS)?.id).toBe("jp-2028");
    expect(masterSetForStartDate("2026-01-01", [])).toBeNull();
  });

  it("offers a newer version only when it is in effect on the period's start date", () => {
    expect(
      newerMasterSetFor(
        { startDate: "2028-01-01", masterSetId: "jp-2026" },
        SETS,
      )?.id,
    ).toBe("jp-2028");
    expect(
      newerMasterSetFor(
        { startDate: "2027-01-01", masterSetId: "jp-2026" },
        SETS,
      ),
    ).toBeNull();
    expect(
      newerMasterSetFor(
        { startDate: "2029-01-01", masterSetId: "jp-2028" },
        SETS,
      ),
    ).toBeNull();
    expect(
      newerMasterSetFor(
        { startDate: "2029-01-01", masterSetId: "jp-2099" },
        SETS,
      ),
    ).toBeNull();
  });

  it("names a version, or shows its id when this app does not know it", () => {
    expect(masterSetName("jp-2028", SETS)).toBe("2028年版");
    expect(masterSetName("jp-2099", SETS)).toBe("jp-2099");
  });
});
