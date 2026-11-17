export type FixedAssetStatus = "active" | "retired" | "sold" | "disposed";

export const FIXED_ASSET_STATUS_LABELS: Record<FixedAssetStatus, string> = {
  active: "償却中",
  retired: "償却済み",
  sold: "売却済み",
  disposed: "廃棄済み",
};

export type FixedAssetDisposalProceedsTo = "bank" | "cash" | "owner";

export const FIXED_ASSET_DISPOSAL_PROCEEDS_LABELS: Record<
  FixedAssetDisposalProceedsTo,
  string
> = {
  bank: "事業用の口座 (普通預金)",
  cash: "現金",
  owner: "個人の口座・財布",
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
  disposalProceedsTo: FixedAssetDisposalProceedsTo | null;
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
  disposalProceedsTo: FixedAssetDisposalProceedsTo | null;
};
