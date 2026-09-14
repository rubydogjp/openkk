import { describe, expect, it } from "vitest";

import {
  assertClosingEntriesMatch,
  buildExpectedClosingEntries,
  type ClosingEntry,
} from "./closing-entries.js";

describe("assertClosingEntriesMatch", () => {
  const entry: ClosingEntry = {
    date: "2026-12-31",
    description: "決算仕訳",
    localId: "virtual:entry",
    businessRate: 1,
    lines: (["debit", "credit"] as const).map((side) => ({
      side,
      bookAccountId: side === "debit" ? "acct_cash" : "acct_sales",
      amount: 100,
      partnerName: "取引先",
      taxCategoryId: "tax_out_of_scope",
      businessCategoryId: "biz_none",
    })),
  };

  it("ignores entry and line order", () => {
    const second = { ...entry, localId: "virtual:second" };
    expect(() => assertClosingEntriesMatch(
      [{ ...second, lines: [...second.lines].reverse() }, entry],
      [entry, second],
    )).not.toThrow();
  });

  it("rejects changed amounts and duplicate entries", () => {
    expect(() => assertClosingEntriesMatch(
      [{ ...entry, lines: entry.lines.map((line) => ({ ...line, amount: 101 })) }],
      [entry],
    )).toThrow(/do not match/);
    expect(() => assertClosingEntriesMatch([entry, entry], [entry])).toThrow(
      /do not match/,
    );
  });
});

describe("buildExpectedClosingEntries fixed-asset disposal", () => {
  it("matches depreciation and sale against the disposal-date book value", () => {
    const entries = buildExpectedClosingEntries({
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      openingJournals: [],
      bookAccounts: [],
      fixedAssets: [
        {
          id: "asset-1",
          name: "業務用PC",
          acquisitionDate: "2025-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 5,
          businessRate: 1,
          status: "sold",
          disposalDate: "2026-06-15",
          disposalPrice: 900_000,
          bookAccountId: "acct_equipment",
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      localId: "virtual:virtual-fixed-asset-asset-1",
      lines: [
        { side: "debit", bookAccountId: "acct_depreciation", amount: 120_000 },
        { side: "credit", bookAccountId: "acct_equipment", amount: 120_000 },
      ],
    });
    expect(entries[1]).toMatchObject({
      localId: "virtual:virtual-fixed-asset-sale-asset-1",
      lines: [
        { side: "debit", bookAccountId: "acct_bank", amount: 900_000 },
        { side: "credit", bookAccountId: "acct_equipment", amount: 840_001 },
        {
          side: "credit",
          bookAccountId: "acct_revenue_固定資産売却益",
          amount: 59_999,
        },
      ],
    });
  });

  it("books the final-year depreciation for an asset marked retired", () => {
    const entries = buildExpectedClosingEntries({
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      openingJournals: [],
      bookAccounts: [],
      fixedAssets: [
        {
          id: "asset-retired",
          name: "償却完了資産",
          acquisitionDate: "2023-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 4,
          businessRate: 1,
          status: "retired",
          disposalDate: null,
          disposalPrice: null,
          bookAccountId: "acct_equipment",
        },
      ],
    });

    expect(entries).toEqual([
      expect.objectContaining({
        date: "2026-12-31",
        localId: "virtual:virtual-fixed-asset-asset-retired",
        lines: [
          expect.objectContaining({ side: "debit", amount: 300_000 }),
          expect.objectContaining({ side: "credit", amount: 300_000 }),
        ],
      }),
    ]);
  });

  it("uses exact integer-ratio rounding at a one-yen boundary", () => {
    const entries = buildExpectedClosingEntries({
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      openingJournals: [],
      bookAccounts: [],
      fixedAssets: [
        {
          id: "asset-rounding",
          name: "少額資産",
          acquisitionDate: "2025-12-01",
          acquisitionCost: 217,
          usefulLife: 2,
          businessRate: 1,
          status: "active",
          disposalDate: null,
          disposalPrice: null,
          bookAccountId: "acct_equipment",
        },
      ],
    });

    expect(entries[0]?.lines).toEqual([
      expect.objectContaining({ side: "debit", amount: 108 }),
      expect.objectContaining({ side: "credit", amount: 108 }),
    ]);
  });
});
