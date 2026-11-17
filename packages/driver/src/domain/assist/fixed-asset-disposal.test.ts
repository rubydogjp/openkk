import { describe, expect, it } from "vitest";

import type { FixedAsset } from "./fixed-asset-data.js";
import {
  EMPTY_FIXED_ASSET_DISPOSAL_ANSWERS,
  fixedAssetDisposalDraft,
  fixedAssetDisposalPreviewEntries,
  fixedAssetDisposalSteps,
  revertFixedAssetDisposalDraft,
  validateFixedAssetDisposalWhen,
} from "./fixed-asset-disposal.js";

const CAMERA: FixedAsset = {
  id: "fa-camera",
  fiscalPeriodId: "fp-2026",
  name: "撮影用カメラ",
  accountName: "機械装置",
  bookAccountId: "acct_machine",
  status: "active",
  acquisitionDate: "2025-01-01",
  acquisitionCost: 300_000,
  usefulLife: 5,
  businessRate: 1,
  disposalDate: null,
  disposalPrice: null,
  disposalProceedsTo: null,
  depreciationStartLabel: "",
  remainingDepreciationLabel: "",
  depreciationProgress: 0,
  currentBookValue: 300_000,
};
const PERIOD = { periodStartDate: "2026-01-01", periodEndDate: "2026-12-31" };

describe("guided sale and disposal of a fixed asset", () => {
  it("asks where the money went only for a sale", () => {
    expect(fixedAssetDisposalSteps("sold")).toEqual([
      "kind",
      "when",
      "where",
      "confirm",
    ]);
    expect(fixedAssetDisposalSteps("disposed")).toEqual([
      "kind",
      "when",
      "confirm",
    ]);
  });

  it("checks the date against the period and the acquisition, and the price as a whole amount", () => {
    const sold = {
      ...EMPTY_FIXED_ASSET_DISPOSAL_ANSWERS,
      kind: "sold" as const,
    };
    expect(
      validateFixedAssetDisposalWhen({
        asset: CAMERA,
        answers: { ...sold, disposalDate: "2027-01-01", disposalPrice: "1" },
        ...PERIOD,
      }),
    ).toBe("処分日は会計期間内にしてください");
    expect(
      validateFixedAssetDisposalWhen({
        asset: CAMERA,
        answers: { ...sold, disposalDate: "2026-06-30", disposalPrice: "1.5" },
        ...PERIOD,
      }),
    ).toMatch(/売却額/);
    expect(
      validateFixedAssetDisposalWhen({
        asset: CAMERA,
        answers: { ...sold, disposalDate: "2026-06-30", disposalPrice: "0" },
        ...PERIOD,
      }),
    ).toBeNull();
    expect(
      validateFixedAssetDisposalWhen({
        asset: CAMERA,
        answers: {
          ...EMPTY_FIXED_ASSET_DISPOSAL_ANSWERS,
          kind: "disposed",
          disposalDate: "2026-06-30",
        },
        ...PERIOD,
      }),
    ).toBeNull();
  });

  it("shows the entry the final closing will book for the answers", () => {
    const entries = fixedAssetDisposalPreviewEntries({
      asset: CAMERA,
      answers: {
        kind: "sold",
        disposalDate: "2026-06-30",
        disposalPrice: "250,000",
        disposalProceedsTo: "owner",
      },
      periodStartDate: PERIOD.periodStartDate,
    });
    expect(entries).toHaveLength(1);
    expect(
      entries[0]!.lines.map((line) => [
        line.side,
        line.accountName,
        line.amount,
      ]),
    ).toEqual([
      ["debit", "事業主貸", "250,000"],
      ["credit", "機械装置", "210,001"],
      ["credit", "事業主借", "39,999"],
    ]);
  });

  it("records the answers on the asset and takes them all back when undone", () => {
    const draft = fixedAssetDisposalDraft(CAMERA, {
      kind: "sold",
      disposalDate: "2026-06-30",
      disposalPrice: "250,000",
      disposalProceedsTo: "cash",
    });
    expect(draft).toMatchObject({
      status: "sold",
      disposalDate: "2026-06-30",
      disposalPrice: "250,000",
      disposalProceedsTo: "cash",
    });
    expect(
      fixedAssetDisposalDraft(CAMERA, {
        kind: "disposed",
        disposalDate: "2026-06-30",
        disposalPrice: "1",
        disposalProceedsTo: "cash",
      }),
    ).toMatchObject({
      status: "disposed",
      disposalPrice: null,
      disposalProceedsTo: null,
    });
    expect(revertFixedAssetDisposalDraft(draft)).toMatchObject({
      status: "active",
      disposalDate: null,
      disposalPrice: null,
      disposalProceedsTo: null,
    });
  });
});
