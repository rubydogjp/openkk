export type FixedAssetStatus = "active" | "retired" | "sold" | "disposed";

export const FIXED_ASSET_STATUS_LABELS: Record<FixedAssetStatus, string> = {
  active: "償却中",
  retired: "完了",
  sold: "売却済",
  disposed: "廃棄済",
};

export function fixedAssetStatusRequiresDisposal(
  status: FixedAssetStatus,
): boolean {
  return status === "sold" || status === "disposed";
}

export type FixedAsset = {
  id: string;
  fiscalPeriodId: string;
  name: string;
  accountName: string;
  bookAccountId: string;
  status: FixedAssetStatus;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessRate: number;
  disposalDate: string | null;
  disposalPrice: number | null;
  depreciationStartLabel: string;
  remainingDepreciationLabel: string;
  depreciationProgress: number;
  currentBookValue: number;
};

export type FixedAssetDraft = {
  name: string;
  account: string;
  acquisitionDate: string;
  acquisitionCost: string;
  usefulLife: number;
  businessRatePercent: number;
  businessRate: number | null;
  status: FixedAssetStatus;
  disposalDate: string | null;
  disposalPrice: string | null;
};
