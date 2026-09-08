export type FixedAssetPreviewItem = {
  id: string;
  fiscalPeriodId: string | null;
  name: string;
  account: string;
  accountId: string | null;
  period: string;
  remaining: string;
  progress: number;
  current: string;
  purchase: string;
  status: string;
  depreciationAmount: string | null;
  // 償却計算の元になる真実の値
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  usefulLife: number | null;
  businessRate: number | null;
  disposalDate: string | null;
  disposalPrice: string | null;
};

export type FixedAssetDraft = {
  name: string;
  account: string;
  acquisitionDate: string;
  acquisitionCost: string; // 金額入力（カンマ区切り可）
  usefulLife: number; // 耐用年数（年）
  businessRatePercent: number; // 事業割合 0..100
  businessRateRatio: number | null;
  status: string;
  disposalDate: string | null;
  disposalPrice: string | null;
};
