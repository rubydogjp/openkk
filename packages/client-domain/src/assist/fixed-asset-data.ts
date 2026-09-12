export type FixedAssetStatus = "償却中" | "完了" | "売却済" | "廃棄済";

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
