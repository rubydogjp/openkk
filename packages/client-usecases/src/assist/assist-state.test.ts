import { describe, expect, it } from "vitest";

import {
  buildOpeningJournalLines,
  resolveFixedAssetAccountId,
  fixedAssetDraftToPatch,
  listFixedAssetsForPeriod,
  mapOpeningJournalToRecord,
  nextOpeningCarryoverId,
  replaceLoadedFixedAssets,
  upsertFixedAsset,
} from "./assist-state-helpers.js";
import {
  formatBusinessRatePercent,
  type FixedAsset,
  type BookAccount,
  type FixedAssetDraft,
  type OpeningCarryoverDraft,
  type OpeningCarryoverRecord,
} from "@rubydogjp/openkk-client-domain";

function carryoverDraft(record: OpeningCarryoverRecord): OpeningCarryoverDraft {
  return {
    date: record.date,
    description: record.description,
    businessRateInput: formatBusinessRatePercent(record.businessRate),
    businessRate: record.businessRate,
    lines: record.lines,
  };
}

describe("fixedAssetDraftToPatch", () => {
  it("preserves the exact backend business rate during unrelated edits", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          businessRatePercent: 33.33333333333333,
          businessRate: 0.3333333333333333,
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
      disposalPrice: null,
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
      disposalDate: null,
      disposalPrice: null,
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
      disposalDate: null,
      disposalPrice: null,
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

describe("resolveFixedAssetAccountId", () => {
  const accounts: BookAccount[] = [
    { id: "asset_current", name: "繰延税金資産", accountType: "asset" },
    { id: "asset_fixed", name: "繰延税金資産", accountType: "asset" },
    { id: "asset_equipment", name: "工具器具備品", accountType: "asset" },
    { id: "expense_equipment", name: "工具器具備品", accountType: "expense" },
  ];

  it("resolves a changed name within asset accounts", () => {
    expect(
      resolveFixedAssetAccountId(
        { accountId: "asset_current", accountName: "繰延税金資産" },
        "工具器具備品",
        accounts,
      ),
    ).toBe("asset_equipment");
  });

  it("retains an unchanged identity among same-name accounts", () => {
    expect(
      resolveFixedAssetAccountId(
        { accountId: "asset_fixed", accountName: "繰延税金資産" },
        "繰延税金資産",
        accounts,
      ),
    ).toBe("asset_fixed");
  });

  it("rejects an incompatible explicit identity without substituting another account", () => {
    expect(
      resolveFixedAssetAccountId(
        { accountId: "expense_equipment", accountName: "工具器具備品" },
        "工具器具備品",
        accounts,
      ),
    ).toBeNull();
    expect(
      resolveFixedAssetAccountId(null, "工具器具備品", [
        {
          id: "expense_equipment",
          name: "工具器具備品",
          accountType: "expense",
        },
      ]),
    ).toBeNull();
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
  const accounts: BookAccount[] = [
    { id: "asset_cash", name: "現金", accountType: "asset" },
    { id: "expense_rent", name: "地代家賃", accountType: "expense" },
    { id: "expense_fee", name: "支払手数料", accountType: "expense" },
  ];
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
    const draft: OpeningCarryoverDraft = carryoverDraft(
      mapOpeningJournalToRecord(
        journal,
        "fp-1",
        accountNameById,
        accountTypeById,
        { tax_10: "課税 10%", tax_out_of_scope: "対象外" },
        { biz_service: "サービス", biz_none: "対象外" },
      ),
    );
    const rebuilt = buildOpeningJournalLines("opening-1", draft, {
      accounts,
      taxCategories: [
        { id: "tax_10", name: "課税 10%" },
        { id: "tax_out_of_scope", name: "対象外" },
      ],
      businessCategories: [
        { id: "biz_service", name: "サービス" },
        { id: "biz_none", name: "対象外" },
      ],
    });

    expect(rebuilt).toEqual(journal.lines);
  });

  it("allocates unused ids for rows added after an earlier row was removed", () => {
    const draft: OpeningCarryoverDraft = carryoverDraft(
      mapOpeningJournalToRecord(
        journal,
        "fp-1",
        accountNameById,
        accountTypeById,
        { tax_10: "課税 10%", tax_out_of_scope: "対象外" },
        { biz_service: "サービス", biz_none: "対象外" },
      ),
    );
    const [rentLine, feeLine, cashLine] = draft.lines;
    if (rentLine == null || feeLine == null || cashLine == null) {
      throw new Error("mapped lines are missing");
    }
    draft.lines = [
      { ...rentLine, id: "opening-1-d" },
      { ...feeLine, id: "opening-1-d2" },
      { ...cashLine, id: "opening-1-c" },
      { ...feeLine, id: null, amount: "20,000" },
      { ...cashLine, id: null, amount: "20,000" },
    ];

    const rebuilt = buildOpeningJournalLines("opening-1", draft, {
      accounts,
      taxCategories: [
        { id: "tax_10", name: "課税 10%" },
        { id: "tax_out_of_scope", name: "対象外" },
      ],
      businessCategories: [
        { id: "biz_service", name: "サービス" },
        { id: "biz_none", name: "対象外" },
      ],
    });

    expect(rebuilt?.map((line) => line.id)).toEqual([
      "opening-1-d",
      "opening-1-d2",
      "opening-1-c",
      "opening-1-d3",
      "opening-1-c2",
    ]);
  });

  it("rejects blank line ids", () => {
    const draft = carryoverDraft(
      mapOpeningJournalToRecord(
        journal,
        "fp-1",
        accountNameById,
        accountTypeById,
        { tax_10: "課税 10%", tax_out_of_scope: "対象外" },
        { biz_service: "サービス", biz_none: "対象外" },
      ),
    );
    const firstLine = draft.lines[0];
    if (firstLine == null) throw new Error("mapped lines are missing");
    draft.lines = [{ ...firstLine, id: "" }];

    expect(() =>
      buildOpeningJournalLines("opening-1", draft, {
        accounts,
        taxCategories: [],
        businessCategories: [],
      }),
    ).toThrow("opening carryover line id must not be blank");
  });
});

function draft(overrides: Partial<FixedAssetDraft> = {}): FixedAssetDraft {
  const base: FixedAssetDraft = {
    name: "業務用PC",
    account: "工具器具備品",
    acquisitionDate: "2026-04-01",
    acquisitionCost: "300,000",
    usefulLife: 4,
    businessRatePercent: 80,
    status: "償却中",
    businessRate: null,
    disposalDate: null,
    disposalPrice: null,
  };
  return Object.assign(base, overrides);
}

function previewAsset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  const base: FixedAsset = {
    id: "asset-1",
    fiscalPeriodId: "fp-1",
    name: "業務用PC",
    accountName: "工具器具備品",
    bookAccountId: "acct_equipment",
    status: "償却中",
    acquisitionDate: "2026-04-01",
    acquisitionCost: 300_000,
    usefulLife: 4,
    businessRate: 0.8,
    disposalDate: null,
    disposalPrice: null,
    depreciationStartLabel: "2026年4月〜",
    remainingDepreciationLabel: "あと48ヶ月",
    depreciationProgress: 0,
    currentBookValue: 300_000,
  };
  return Object.assign(base, overrides);
}
