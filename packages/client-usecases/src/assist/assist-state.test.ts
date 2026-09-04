import { describe, expect, it } from "vitest";

import {
  fixedAssetDraftToPatch,
  groupAccountIdsByName,
  listFixedAssetsForPeriod,
  nextOpeningCarryoverId,
  replaceLoadedFixedAssets,
  resolveBookAccountId,
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
