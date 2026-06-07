import { describe, expect, it } from "vitest";

import {
  parseFiscalPeriodDbRecord,
  parseFixedAssetDbRecord,
  serializeFiscalPeriodDbRecord,
} from "./persistence-codec";

describe("SQLite persistence codecs", () => {
  it("parses phase and archive status independently", () => {
    const record = parseFiscalPeriodDbRecord(
      JSON.stringify({
        id: "fp-1",
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "pre_opening",
        archiveStatus: "archived",
        settingsCompleted: false,
        openingBalancesCompleted: false,
        documentsReceivedCompleted: false,
        opening: null,
      }),
    );
    expect(record.phase).toBe("pre_opening");
    expect(record.archiveStatus).toBe("archived");
  });

  it.each([
    ["fiscal period", parseFiscalPeriodDbRecord, { id: "fp-1" }],
    ["fixed asset", parseFixedAssetDbRecord, { id: "fa-1", usefulLife: null }],
  ])("rejects malformed %s JSON", (_label, parse, value) => {
    expect(() => parse(JSON.stringify(value))).toThrow(
      /Invalid .* data in SQLite/,
    );
  });

  it("does not persist column-backed fields inside fiscal period JSON", () => {
    const json = serializeFiscalPeriodDbRecord({
      id: "fp-1",
      userId: "user-1",
      name: "FY2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      phase: "pre_opening",
      archiveStatus: "active",
      settingsCompleted: false,
      openingBalancesCompleted: false,
      documentsReceivedCompleted: false,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      opening: {
        id: "opening-1",
        userId: "user-1",
        fiscalPeriodId: "fp-1",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        openingBalanceLines: [],
        openingJournals: [],
      },
    });
    const parsed = JSON.parse(json);
    expect(parsed).not.toHaveProperty("opening");
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("createdAt");
    expect(parsed).not.toHaveProperty("updatedAt");
  });
});
