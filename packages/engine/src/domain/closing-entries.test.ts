import { describe, expect, it } from "vitest";

import {
  assertClosingEntriesMatch,
  buildExpectedClosingEntries,
  businessShareOfAmount,
  computeFixedAssetBookValue,
} from "./closing-entries.js";
import type { Entry } from "./models.js";

describe("assertClosingEntriesMatch", () => {
  const entry: Entry = {
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
    expect(() =>
      assertClosingEntriesMatch(
        [{ ...second, lines: [...second.lines].reverse() }, entry],
        [entry, second],
      ),
    ).not.toThrow();
  });

  it("rejects changed amounts and duplicate entries", () => {
    expect(() =>
      assertClosingEntriesMatch(
        [
          {
            ...entry,
            lines: entry.lines.map((line) => ({ ...line, amount: 101 })),
          },
        ],
        [entry],
      ),
    ).toThrow(/do not match/);
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
          depreciationMethod: "straight_line",
          businessRate: 1,
          status: "sold",
          disposalDate: "2026-06-15",
          disposalPrice: 900_000,
          disposalProceedsTo: null,
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
          bookAccountId: "acct_proprietor_loan",
          amount: 59_999,
        },
      ],
    });
  });

  function saleEntry(input: {
    disposalPrice: number;
    disposalProceedsTo: "bank" | "cash" | "owner" | null;
  }) {
    const entries = buildExpectedClosingEntries({
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      openingJournals: [],
      bookAccounts: [],
      fixedAssets: [
        {
          id: "asset-2",
          name: "社用車",
          acquisitionDate: "2020-01-01",
          acquisitionCost: 1_200_000,
          usefulLife: 4,
          depreciationMethod: "straight_line",
          businessRate: 0.7,
          status: "sold",
          disposalDate: "2026-03-31",
          disposalPrice: input.disposalPrice,
          disposalProceedsTo: input.disposalProceedsTo,
          bookAccountId: "acct_vehicle",
        },
      ],
    });
    return entries.find(
      (entry) => entry.localId === "virtual:virtual-fixed-asset-sale-asset-2",
    );
  }

  it.each([
    ["bank", "acct_bank"],
    ["cash", "acct_cash"],
    ["owner", "acct_proprietor_withdrawal"],
    [null, "acct_bank"],
  ] as const)(
    "puts the proceeds received into %s on %s and the gain on 事業主借, not on the profit and loss",
    (destination, account) => {
      expect(
        saleEntry({ disposalPrice: 50_000, disposalProceedsTo: destination })
          ?.lines,
      ).toEqual([
        expect.objectContaining({
          side: "debit",
          bookAccountId: account,
          amount: 50_000,
        }),
        expect.objectContaining({
          side: "credit",
          bookAccountId: "acct_vehicle",
          amount: 1,
        }),
        expect.objectContaining({
          side: "credit",
          bookAccountId: "acct_proprietor_loan",
          amount: 49_999,
        }),
      ]);
    },
  );

  it("puts a loss on 事業主貸 and books nothing for the proceeds when they are zero", () => {
    const entries = buildExpectedClosingEntries({
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      openingJournals: [],
      bookAccounts: [],
      fixedAssets: [
        {
          id: "asset-3",
          name: "カメラ",
          acquisitionDate: "2025-01-01",
          acquisitionCost: 300_000,
          usefulLife: 5,
          depreciationMethod: "straight_line",
          businessRate: 1,
          status: "sold",
          disposalDate: "2026-06-30",
          disposalPrice: 0,
          disposalProceedsTo: "owner",
          bookAccountId: "acct_machine",
        },
      ],
    });
    const sale = entries.find((entry) =>
      entry.localId?.endsWith("fixed-asset-sale-asset-3"),
    );
    expect(sale?.lines).toEqual([
      expect.objectContaining({
        side: "debit",
        bookAccountId: "acct_proprietor_withdrawal",
        amount: 210_001,
      }),
      expect.objectContaining({
        side: "credit",
        bookAccountId: "acct_machine",
        amount: 210_001,
      }),
    ]);
  });

  it("books only the proceeds against the book value when they are equal", () => {
    expect(
      saleEntry({ disposalPrice: 1, disposalProceedsTo: "cash" })?.lines,
    ).toEqual([
      expect.objectContaining({
        side: "debit",
        bookAccountId: "acct_cash",
        amount: 1,
      }),
      expect.objectContaining({
        side: "credit",
        bookAccountId: "acct_vehicle",
        amount: 1,
      }),
    ]);
  });

  it("keeps a disposal as a retirement loss", () => {
    const entries = buildExpectedClosingEntries({
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-12-31",
      entries: [],
      openingJournals: [],
      bookAccounts: [],
      fixedAssets: [
        {
          id: "asset-4",
          name: "プリンター",
          acquisitionDate: "2025-01-01",
          acquisitionCost: 100_000,
          usefulLife: 5,
          depreciationMethod: "straight_line",
          businessRate: 1,
          status: "disposed",
          disposalDate: "2026-06-30",
          disposalPrice: null,
          disposalProceedsTo: null,
          bookAccountId: "acct_equipment",
        },
      ],
    });
    expect(
      entries.find((entry) => entry.localId?.endsWith("retire-asset-4"))?.lines,
    ).toEqual([
      expect.objectContaining({
        side: "debit",
        bookAccountId: "acct_expense_固定資産除却損",
      }),
      expect.objectContaining({
        side: "credit",
        bookAccountId: "acct_equipment",
      }),
    ]);
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
          depreciationMethod: "straight_line",
          businessRate: 1,
          status: "retired",
          disposalDate: null,
          disposalPrice: null,
          disposalProceedsTo: null,
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
          depreciationMethod: "straight_line",
          businessRate: 1,
          status: "active",
          disposalDate: null,
          disposalPrice: null,
          disposalProceedsTo: null,
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

describe("computeFixedAssetBookValue", () => {
  it("keeps yen precision near the largest accepted acquisition cost", () => {
    expect(
      computeFixedAssetBookValue({
        acquisitionDate: "2026-01-01",
        acquisitionCost: 9_007_199_254_740_918,
        usefulLife: 7,
        asOf: "2026-06-30",
      }),
    ).toBe(8_363_827_879_402_282);
  });
});

describe("businessShareOfAmount", () => {
  it("rounds half up on the exact share where floating point falls just below", () => {
    expect(100 * 0.145).toBeLessThan(14.5);
    expect(businessShareOfAmount(100, 0.145)).toBe(15);
    expect(businessShareOfAmount(1_000, 0.335)).toBe(335);
    expect(businessShareOfAmount(5, 0.5)).toBe(3);
    expect(businessShareOfAmount(1_000, 1)).toBe(1_000);
    expect(businessShareOfAmount(1_000, 0)).toBe(0);
  });

  it("stays exact for the largest safe amount", () => {
    expect(businessShareOfAmount(Number.MAX_SAFE_INTEGER, 1)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
