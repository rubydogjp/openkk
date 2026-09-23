import { describe, expect, it } from "vitest";
import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
} from "@rubydogjp/openkk-server-domain";
import type {
  FiscalPeriodDbRecord,
  FiscalPeriodOpeningDbRecord,
} from "@rubydogjp/openkk-server-ports";

import {
  parseFiscalPeriodDbData,
  parseFixedAssetDbData,
  serializeFiscalPeriodDbData,
  validateOpeningDbRecord,
} from "./persistence-codec.js";

describe("SQLite persistence codecs", () => {
  it("parses phase and archive status independently", () => {
    const record = parseFiscalPeriodDbData(
      JSON.stringify({
        id: "fp-1",
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "pre_opening",
        archiveStatus: "archived",
        archivedAt: "2026-12-31T00:00:00.000Z",
        openingBalancesCompleted: false,
        documentsReceivedCompleted: false,
      }),
    );
    expect(record.phase).toBe("pre_opening");
    expect(record.archiveStatus).toBe("archived");
  });

  it.each([
    ["fiscal period", parseFiscalPeriodDbData, { id: "fp-1" }],
    ["fixed asset", parseFixedAssetDbData, { id: "fa-1", usefulLife: null }],
  ])("rejects malformed %s JSON", (_label, parse, value) => {
    expect(() => parse(JSON.stringify(value))).toThrow(
      /Invalid .* data in SQLite/,
    );
  });

  it("does not persist column-backed fields inside fiscal period JSON", () => {
    const record: FiscalPeriodDbRecord = {
      id: "fp-1",
      userId: "user-1",
      name: "FY2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      phase: "pre_opening",
      archiveStatus: "active",
      openingBalancesCompleted: false,
      documentsReceivedCompleted: false,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      opening: {
        openingBalanceLines: [],
        openingJournals: [],
      },
      archivedAt: null,
    };
    const json = serializeFiscalPeriodDbData(record);
    const parsed = JSON.parse(json);
    expect(parsed).not.toHaveProperty("opening");
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("createdAt");
    expect(parsed).not.toHaveProperty("updatedAt");
  });

  it.each([
    ["an inverted range", { startDate: "2027-01-01" }],
    ["a blank name", { name: "   " }],
    [
      "inconsistent lifecycle fields",
      { phase: "pre_closing", openingBalancesCompleted: false },
    ],
    ["an unknown archive status", { archiveStatus: "deleted" }],
    ["an active archive timestamp", { archivedAt: "2026-12-31T00:00:00.000Z" }],
    ["a missing archivedAt field", { archivedAt: undefined }],
  ])("rejects a fiscal period with %s", (_label, patch) => {
    expect(() =>
      parseFiscalPeriodDbData(
        JSON.stringify({
          id: "fp-1",
          name: "FY2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          archiveStatus: "active",
          archivedAt: null,
          openingBalancesCompleted: true,
          documentsReceivedCompleted: false,
          ...patch,
        }),
      ),
    ).toThrow(/Invalid fiscal period data in SQLite/);
  });

  it("rejects malformed opening records before normalized persistence", () => {
    expect(() =>
      validateOpeningDbRecord({
        openingBalanceLines: [],
        openingJournals: [
          {
            id: "journal-1",
            date: "2026-01-01",
            description: "carryover",
            businessRate: 1,
            lines: [
              {
                id: "line-1",
                side: "debit",
                bookAccountId: "acct_cash",
                amount: 1000,
                partnerName: "",
                taxCategoryId: "tax_out_of_scope",
                businessCategoryId: "",
              },
            ],
          },
        ],
      }),
    ).toThrow(/positive debit and credit lines/);
  });

  it("rejects oversized opening records before JSON serialization", () => {
    const opening = validOpening();
    expect(() =>
      validateOpeningDbRecord({
        ...opening,
        openingBalanceLines: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill({
          id: "balance",
          accountId: "a:現金",
          amount: 0,
        }),
      }),
    ).toThrow(/Stored opening balance lines exceed the 10,000 item limit/);

    expect(() =>
      validateOpeningDbRecord({
        ...opening,
        openingJournals: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill({
          id: "journal",
          date: "2026-01-01",
          description: "",
          businessRate: 1,
          lines: [],
        }),
      }),
    ).toThrow(/Stored opening journals exceed the 10,000 item limit/);
  });

  it("rejects excessive aggregate opening lines before JSON serialization", () => {
    const opening = validOpening();
    const line = {
      id: "line",
      side: "debit" as const,
      bookAccountId: "acct_cash",
      amount: 0,
      partnerName: "",
      taxCategoryId: "",
      businessCategoryId: "",
    };
    const lines = Array(MAX_ENTRY_LINES).fill(line);
    const openingJournals = Array.from(
      { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
      (_, index) => ({
        id: `journal-${index}`,
        date: "2026-01-01",
        description: "",
        businessRate: 1,
        lines,
      }),
    );

    expect(() =>
      validateOpeningDbRecord({ ...opening, openingJournals }),
    ).toThrow(/Stored opening journal lines exceed the 100,000 line limit/);
  });

  it("rejects zero-cost fixed assets loaded from SQLite", () => {
    expect(() =>
      parseFixedAssetDbData(
        JSON.stringify({
          id: "fa-1",
          fiscalPeriodId: "fp-1",
          name: "Camera",
          acquisitionDate: "2026-01-01",
          acquisitionCost: 0,
          usefulLife: 3,
          depreciationMethod: "straight_line",
          businessRate: 1,
          status: "active",
          disposalDate: null,
          disposalPrice: null,
          bookAccountId: "acct_equipment",
        }),
      ),
    ).toThrow(/acquisitionCost must be a positive safe integer/);
  });
});

function validOpening(): FiscalPeriodOpeningDbRecord {
  return {
    openingBalanceLines: [],
    openingJournals: [],
  };
}
