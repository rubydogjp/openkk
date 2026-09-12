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
  parseFiscalPeriodDataColumn,
  parseFixedAssetDataColumn,
  serializeFiscalPeriodDataColumn,
  validateOpeningDbRecord,
} from "./persistence-codec.js";

describe("SQLite persistence codecs", () => {
  it("parses phase and archive status independently", () => {
    const record = parseFiscalPeriodDataColumn(
      JSON.stringify({
        id: "fp-1",
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "pre_opening",
        archiveStatus: "archived",
        archiveDataAvailable: true,
        archivedAt: "2026-12-31T00:00:00.000Z",
        settingsCompleted: false,
        openingBalancesCompleted: false,
        documentsReceivedCompleted: false,
      }),
    );
    expect(record.phase).toBe("pre_opening");
    expect(record.archiveStatus).toBe("archived");
  });

  it.each([
    ["fiscal period", parseFiscalPeriodDataColumn, { id: "fp-1" }],
    ["fixed asset", parseFixedAssetDataColumn, { id: "fa-1", usefulLife: null }],
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
      archiveDataAvailable: true,
      archivedAt: null,
    };
    const json = serializeFiscalPeriodDataColumn(record);
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
    [
      "an active purged-data marker",
      { archiveDataAvailable: false, archiveStatus: "active" },
    ],
    ["a missing archivedAt field", { archivedAt: undefined }],
  ])("rejects a fiscal period with %s", (_label, patch) => {
    expect(() =>
      parseFiscalPeriodDataColumn(
        JSON.stringify({
          id: "fp-1",
          name: "FY2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          archiveStatus: "active",
          archiveDataAvailable: true,
          archivedAt: null,
          settingsCompleted: true,
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
        id: "opening-1",
        userId: "user-1",
        fiscalPeriodId: "fp-1",
        createdAt: "not-a-timestamp",
        updatedAt: "1970-01-01T00:00:00.000Z",
        openingBalanceLines: [],
        openingJournals: [],
      }),
    ).toThrow(/createdAt must be an ISO timestamp/);

    expect(() =>
      validateOpeningDbRecord({
        id: "opening-1",
        userId: "user-1",
        fiscalPeriodId: "fp-1",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
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
    ).toThrow(/Opening balance lines exceed the 10,000 item limit/);

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
    ).toThrow(/Opening journals exceed the 10,000 item limit/);
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
    ).toThrow(/Opening journal lines exceed the 100,000 line limit/);
  });

  it("rejects zero-cost fixed assets loaded from SQLite", () => {
    expect(() =>
      parseFixedAssetDataColumn(
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
    id: "opening-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    openingBalanceLines: [],
    openingJournals: [],
  };
}
