export type FixedAssetPreviewItem = {
  id: string;
  fiscalPeriodId?: string;
  name: string;
  account: string;
  accountId?: string;
  period: string;
  remaining: string;
  progress: number;
  current: string;
  purchase: string;
  status: string;
  depreciationAmount?: string;
  // 償却計算の元になる真実の値
  acquisitionDate?: string;
  acquisitionCost?: number;
  usefulLife?: number;
  businessRate?: number;
  disposalDate?: string;
  disposalPrice?: string;
};

export type FixedAssetDraft = {
  name: string;
  account: string;
  acquisitionDate: string;
  acquisitionCost: string; // 金額入力（カンマ区切り可）
  usefulLife: number; // 耐用年数（年）
  businessRatePercent: number; // 事業割合 0..100
  status: string;
  disposalDate?: string;
  disposalPrice?: string;
};
