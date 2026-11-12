import { describe, expect, it } from "vitest";

import type { BookFileRelation } from "@rubydogjp/openkk-books-db-adapter";

import { bookImportCase } from "./import-case.js";

const existing = {
  id: "fp-1",
  userId: "user-1",
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  phase: "journalizing" as const,
  archiveStatus: "active" as const,
  archivedAt: null,
  openingBalancesCompleted: true,
  documentsReceivedCompleted: false,
  opening: { balanceLines: [], journals: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function samePeriod(inApp: number): BookFileRelation {
  return { kind: "same_period", existing, existingLastChangedAt: inApp };
}

describe("bookImportCase", () => {
  it.each([
    {
      label: "the file is what the app holds",
      inFile: 100,
      inApp: 100,
      saved: 100,
      expected: "same",
    },
    {
      label: "the file is what the app holds, never saved here",
      inFile: 100,
      inApp: 100,
      saved: null,
      expected: "same",
    },
    {
      label: "the file was changed outside after it was saved",
      inFile: 150,
      inApp: 100,
      saved: 100,
      expected: "changed_outside",
    },
    {
      label: "the app was changed after the file was saved",
      inFile: 100,
      inApp: 150,
      saved: 100,
      expected: "replaces_app_changes",
    },
    {
      label: "both the file and the app were changed after the save",
      inFile: 150,
      inApp: 160,
      saved: 100,
      expected: "changed_both",
    },
    {
      label: "the file is older than the last save",
      inFile: 50,
      inApp: 100,
      saved: 100,
      expected: "replaces_app_changes",
    },
    {
      label: "the file is older than the last save and the app changed again",
      inFile: 50,
      inApp: 150,
      saved: 100,
      expected: "replaces_app_changes",
    },
    {
      label: "never saved here and the file is newer than the app",
      inFile: 150,
      inApp: 100,
      saved: null,
      expected: "changed_both",
    },
    {
      label: "never saved here and the file is older than the app",
      inFile: 50,
      inApp: 100,
      saved: null,
      expected: "replaces_app_changes",
    },
    {
      label: "the file has no stamp",
      inFile: null,
      inApp: 100,
      saved: 100,
      expected: "replaces_app_changes",
    },
  ])("$label", ({ inFile, inApp, saved, expected }) => {
    expect(
      bookImportCase(
        { lastChangedAt: inFile, relation: samePeriod(inApp) },
        saved,
      ),
    ).toBe(expected);
  });

  it("passes through the cases that do not depend on stamps", () => {
    expect(
      bookImportCase({ lastChangedAt: 1, relation: { kind: "new" } }, null),
    ).toBe("new");
    expect(
      bookImportCase(
        {
          lastChangedAt: 1,
          relation: {
            kind: "same_dates",
            existing,
            existingLastChangedAt: 1,
          },
        },
        1,
      ),
    ).toBe("same_dates");
    expect(
      bookImportCase(
        {
          lastChangedAt: 1,
          relation: { kind: "overlapping", existing: [existing] },
        },
        null,
      ),
    ).toBe("overlapping");
  });
});
