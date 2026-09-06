import { describe, expect, it } from "vitest";

import {
  buildOpeningJournalLines,
  fixedAssetDraftToPatch,
  groupAccountIdsByName,
  listFixedAssetsForPeriod,
  mapOpeningJournalToRecord,
  nextOpeningCarryoverId,
  replaceLoadedFixedAssets,
  resolveBookAccountId,
  resolveUpdatedBookAccountId,
  upsertFixedAsset,
} from "./assist-state-helpers.js";
import type {
  FixedAssetDraft,
  FixedAssetPreviewItem,
} from "@rubydogjp/openkk-client-domain";

describe("fixedAssetDraftToPatch", () => {
  it("preserves the exact backend business rate during unrelated edits", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          businessRatePercent: 33.33333333333333,
          businessRateRatio: 0.3333333333333333,
        }),
        "acct_equipment",
      ).businessRate,
    ).toBe(0.3333333333333333);
  });

  it("keeps disposal date and price when an asset is sold", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "売却済",
          disposalDate: "2026-09-20",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "sold",
      disposalDate: "2026-09-20",
      disposalPrice: 50_000,
      bookAccountId: "acct_equipment",
    });
  });

  it("keeps disposal date and clears price when an asset is disposed", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "廃棄済",
          disposalDate: "2026-10-01",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "disposed",
      disposalDate: "2026-10-01",
      disposalPrice: 0,
    });
  });

  it("clears disposal fields when an asset is active again", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "償却中",
          disposalDate: "2026-09-20",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "active",
      disposalDate: "",
      disposalPrice: 0,
    });
  });

  it("clears stale disposal fields when an asset is marked complete", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "完了",
          disposalDate: "2026-09-20",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "retired",
      disposalDate: "",
      disposalPrice: 0,
    });
  });
});

describe("replaceLoadedFixedAssets", () => {
  it("keeps loaded assets when a fiscal period is selected", () => {
    const assets = [previewAsset({ id: "asset-1" })];

    expect(replaceLoadedFixedAssets("fp-1", assets)).toBe(assets);
  });

  it("clears cached assets when no fiscal period is selected", () => {
    const assets = [previewAsset({ id: "asset-1" })];

    expect(replaceLoadedFixedAssets(null, assets)).toEqual([]);
    expect(replaceLoadedFixedAssets("", assets)).toEqual([]);
  });
});

describe("upsertFixedAsset", () => {
  it("replaces an existing async result without duplicating it", () => {
    const current = [previewAsset({ id: "asset-1", name: "old" })];
    const next = previewAsset({ id: "asset-1", name: "new" });

    expect(upsertFixedAsset(current, next)).toEqual([next]);
  });

  it("appends an unseen asset", () => {
    const current = [previewAsset({ id: "asset-1" })];
    const next = previewAsset({ id: "asset-2" });

    expect(upsertFixedAsset(current, next)).toEqual([current[0], next]);
  });
});

describe("listFixedAssetsForPeriod", () => {
  it("does not expose an old period result to the newly selected period", () => {
    const assets = [
      previewAsset({ id: "old", fiscalPeriodId: "fp-old" }),
      previewAsset({ id: "current", fiscalPeriodId: "fp-current" }),
    ];

    expect(listFixedAssetsForPeriod(assets, "fp-current")).toEqual([assets[1]]);
  });

  it("keeps the unfiltered form for the current fixed-assets screen", () => {
    const assets = [previewAsset()];

    expect(listFixedAssetsForPeriod(assets)).toBe(assets);
  });
});

describe("nextOpeningCarryoverId", () => {
  it("starts at 1 for an empty fiscal period", () => {
    expect(nextOpeningCarryoverId("fp-2026", [])).toBe("oc-fp-2026-1");
  });

  it("does not reuse a suffix after deletion (no collision)", () => {
    const journals = [{ id: "oc-fp-2026-1" }, { id: "oc-fp-2026-2" }];
    const afterDelete = journals.filter((j) => j.id !== "oc-fp-2026-1");
    expect(nextOpeningCarryoverId("fp-2026", afterDelete)).toBe("oc-fp-2026-3");
  });

  it("ignores ids from other fiscal periods", () => {
    const journals = [{ id: "oc-fp-2025-9" }, { id: "oc-fp-2026-1" }];
    expect(nextOpeningCarryoverId("fp-2026", journals)).toBe("oc-fp-2026-2");
  });

  it("ignores unsafe numeric suffixes that would round into a duplicate", () => {
    const journals = [
      { id: "oc-fp-2026-1" },
      { id: "oc-fp-2026-9007199254740992" },
    ];

    expect(nextOpeningCarryoverId("fp-2026", journals)).toBe("oc-fp-2026-2");
  });

  it("uses a free suffix after the safe integer ceiling", () => {
    const journals = [
      { id: "oc-fp-2026-1" },
      { id: `oc-fp-2026-${Number.MAX_SAFE_INTEGER}` },
    ];

    expect(nextOpeningCarryoverId("fp-2026", journals)).toBe("oc-fp-2026-2");
  });
});

describe("resolveBookAccountId", () => {
  const accountTypeById = {
    asset_bonus: "asset",
    expense_bonus: "expense",
  } as const;
  const accountIdsByName = groupAccountIdsByName([
    { id: "asset_bonus", name: "賞与" },
    { id: "expense_bonus", name: "賞与" },
  ]);

  it("resolves duplicate display names by account type", () => {
    expect(
      resolveBookAccountId(undefined, "賞与", "expense", {
        accountIdsByName,
        accountTypeById,
      }),
    ).toBe("expense_bonus");
  });

  it("keeps an explicit id only when its type agrees", () => {
    expect(
      resolveBookAccountId("asset_bonus", "賞与", "asset", {
        accountIdsByName,
        accountTypeById,
      }),
    ).toBe("asset_bonus");
    expect(
      resolveBookAccountId("asset_bonus", "賞与", "expense", {
        accountIdsByName,
        accountTypeById,
      }),
    ).toBe("expense_bonus");
  });
});

describe("resolveUpdatedBookAccountId", () => {
  const master = {
    accountTypeById: {
      asset_current: "asset",
      asset_fixed: "asset",
      asset_equipment: "asset",
      expense_equipment: "expense",
    } as const,
    accountIdsByName: groupAccountIdsByName([
      { id: "asset_current", name: "繰延税金資産" },
      { id: "asset_fixed", name: "繰延税金資産" },
      { id: "asset_equipment", name: "工具器具備品" },
      { id: "expense_equipment", name: "工具器具備品" },
    ]),
  };

  it("resolves a changed account name instead of retaining the old id", () => {
    expect(
      resolveUpdatedBookAccountId(
        { accountId: "asset_current", accountName: "繰延税金資産" },
        "工具器具備品",
        "asset",
        master,
      ),
    ).toBe("asset_equipment");
  });

  it("retains an unchanged id when same-name accounts are ambiguous", () => {
    expect(
      resolveUpdatedBookAccountId(
        { accountId: "asset_fixed", accountName: "繰延税金資産" },
        "繰延税金資産",
        "asset",
        master,
      ),
    ).toBe("asset_fixed");
  });

  it("does not resolve a changed name to an account of another type", () => {
    expect(
      resolveUpdatedBookAccountId(
        { accountId: "asset_current", accountName: "繰延税金資産" },
        "工具器具備品",
        "expense",
        master,
      ),
    ).toBe("expense_equipment");
  });
});

describe("compound opening journals", () => {
  const accountNameById = {
    asset_cash: "現金",
    expense_rent: "地代家賃",
    expense_fee: "支払手数料",
  };
  const accountTypeById = {
    asset_cash: "asset",
    expense_rent: "expense",
    expense_fee: "expense",
  } as const;
  const accountIdsByName = groupAccountIdsByName(
    Object.entries(accountNameById).map(([id, name]) => ({ id, name })),
  );
  const journal = {
    id: "opening-1",
    date: "2026-01-01",
    description: "複合再振替",
    businessRate: 1,
    lines: [
      {
        id: "line-rent",
        side: "debit" as const,
        bookAccountId: "expense_rent",
        amount: 80_000,
        partnerName: "貸主",
        taxCategoryId: "tax_10",
        businessCategoryId: "biz_service",
      },
      {
        id: "line-fee",
        side: "debit" as const,
        bookAccountId: "expense_fee",
        amount: 20_000,
        partnerName: "銀行",
        taxCategoryId: "tax_10",
        businessCategoryId: "biz_none",
      },
      {
        id: "line-cash",
        side: "credit" as const,
        bookAccountId: "asset_cash",
        amount: 100_000,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
    ],
  };

  it("maps every persisted line into the editable record", () => {
    const record = mapOpeningJournalToRecord(
      journal,
      "fp-1",
      accountNameById,
      accountTypeById,
      { tax_10: "課税 10%", tax_out_of_scope: "対象外" },
      { biz_service: "サービス", biz_none: "対象外" },
    );

    expect(record.lines).toHaveLength(3);
    expect(record.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "line-fee",
          accountName: "支払手数料",
          partnerName: "銀行",
          businessCategoryId: "biz_none",
        }),
      ]),
    );
  });

  it("preserves line ids and line-specific metadata when saved", () => {
    const draft = mapOpeningJournalToRecord(
      journal,
      "fp-1",
      accountNameById,
      accountTypeById,
      { tax_10: "課税 10%", tax_out_of_scope: "対象外" },
      { biz_service: "サービス", biz_none: "対象外" },
    );
    const rebuilt = buildOpeningJournalLines("opening-1", draft, {
      accountIdsByName,
      accountTypeById,
      taxCategoryIdByValue: {
        tax_10: "tax_10",
        tax_out_of_scope: "tax_out_of_scope",
      },
      businessCategoryIdByValue: {
        biz_service: "biz_service",
        biz_none: "biz_none",
      },
    });

    expect(rebuilt).toEqual(journal.lines);
  });

  it("allocates unused ids for rows added after an earlier row was removed", () => {
    const draft = mapOpeningJournalToRecord(
      journal,
      "fp-1",
      accountNameById,
      accountTypeById,
      { tax_10: "課税 10%", tax_out_of_scope: "対象外" },
      { biz_service: "サービス", biz_none: "対象外" },
    );
    const originalLines = draft.lines;
    const [rentLine, feeLine, cashLine] = originalLines ?? [];
    if (rentLine == null || feeLine == null || cashLine == null) {
      throw new Error("mapped lines are missing");
    }
    draft.lines = [
      { ...rentLine, id: "opening-1-d" },
      { ...feeLine, id: "opening-1-d2" },
      { ...cashLine, id: "opening-1-c" },
      { ...feeLine, id: "", amount: "20,000" },
      { ...cashLine, id: "", amount: "20,000" },
    ];

    const rebuilt = buildOpeningJournalLines("opening-1", draft, {
      accountIdsByName,
      accountTypeById,
      taxCategoryIdByValue: {
        tax_10: "tax_10",
        tax_out_of_scope: "tax_out_of_scope",
      },
      businessCategoryIdByValue: {
        biz_service: "biz_service",
        biz_none: "biz_none",
      },
    });

    expect(rebuilt?.map((line) => line.id)).toEqual([
      "opening-1-d",
      "opening-1-d2",
      "opening-1-c",
      "opening-1-d3",
      "opening-1-c2",
    ]);
  });
});

function draft(overrides: Partial<FixedAssetDraft> = {}): FixedAssetDraft {
  return {
    name: "業務用PC",
    account: "工具器具備品",
    acquisitionDate: "2026-04-01",
    acquisitionCost: "300,000",
    usefulLife: 4,
    businessRatePercent: 80,
    status: "償却中",
    ...overrides,
  };
}

function previewAsset(
  overrides: Partial<FixedAssetPreviewItem> = {},
): FixedAssetPreviewItem {
  return {
    id: "asset-1",
    fiscalPeriodId: "fp-1",
    name: "業務用PC",
    account: "工具器具備品",
    period: "2026年4月〜2030年3月",
    remaining: "残り4年",
    progress: 0,
    current: "300,000",
    purchase: "300,000",
    status: "償却中",
    ...overrides,
  };
}
