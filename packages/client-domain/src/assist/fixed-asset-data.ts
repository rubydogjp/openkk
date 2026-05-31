export type FixedAssetPreviewItem = {
  id: string;
  fiscalPeriodId?: string;
  name: string;
  account: string;
  accountId?: string;
  // 計算で導出される表示値（保存しない）
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

// 編集ドロワーが扱うのは「真実」の入力値のみ。簿価・進捗・残期間は
// これらから計算で導出され、ユーザーは直接編集しない。
export type FixedAssetDraft = {
  name: string;
  account: string;
  acquisitionDate: string;
  acquisitionCost: string; // 金額入力（カンマ区切り可）
  usefulLife: number; // 耐用年数（年）
  businessRatePercent: number; // 事業割合 0..100
  status: string;
};

export const exampleFixedAssetItems: FixedAssetPreviewItem[] = [
  {
    id: "fa-1",
    fiscalPeriodId: "fp-2026",
    name: "MacBook Pro 14インチ",
    account: "工具器具備品",
    accountId: "acct_equipment",
    period: "2025年6月〜",
    remaining: "残り 30か月",
    progress: 0.38,
    current: "283,500",
    purchase: "378,000",
    status: "償却中",
    acquisitionDate: "2025-06-15",
    usefulLife: 4,
    businessRate: 0.8,
    depreciationAmount: "94,500",
  },
  {
    id: "fa-2",
    fiscalPeriodId: "fp-2026",
    name: "業務用デスク・チェアセット",
    account: "工具器具備品",
    accountId: "acct_equipment",
    period: "2023年8月〜",
    remaining: "残り 56か月",
    progress: 0.42,
    current: "92,188",
    purchase: "147,500",
    status: "償却中",
    acquisitionDate: "2023-08-20",
    usefulLife: 8,
    businessRate: 1,
    depreciationAmount: "18,438",
  },
  {
    id: "fa-3",
    fiscalPeriodId: "fp-2026",
    name: "社用車(軽自動車)",
    account: "車両運搬具",
    accountId: "acct_vehicle",
    period: "2024年3月〜",
    remaining: "残り 38か月",
    progress: 0.47,
    current: "888,000",
    purchase: "1,480,000",
    status: "償却中",
    acquisitionDate: "2024-03-10",
    usefulLife: 6,
    businessRate: 0.7,
    depreciationAmount: "296,000",
  },
  {
    id: "fa-4",
    fiscalPeriodId: "fp-2026",
    name: "4Kモニター 27インチ",
    account: "工具器具備品",
    accountId: "acct_equipment",
    period: "2026年4月〜",
    remaining: "残り 52か月",
    progress: 0.13,
    current: "50,240",
    purchase: "62,800",
    status: "償却中",
    acquisitionDate: "2026-04-03",
    usefulLife: 5,
    businessRate: 1,
    depreciationAmount: "12,560",
  },
  {
    id: "fa-5",
    fiscalPeriodId: "fp-2026",
    name: "撮影用ミラーレス一眼",
    account: "機械装置",
    accountId: "acct_machine",
    period: "2024年10月〜2026年9月",
    remaining: "売却済み",
    progress: 0.68,
    current: "112,000",
    purchase: "248,000",
    status: "売却済",
    acquisitionDate: "2024-10-01",
    usefulLife: 5,
    businessRate: 1,
    disposalDate: "2026-09-30",
    disposalPrice: "130,000",
  },
  {
    id: "fa-6",
    fiscalPeriodId: "fp-2026",
    name: "プリンター複合機",
    account: "工具器具備品",
    accountId: "acct_equipment",
    period: "2023年4月〜2025年11月",
    remaining: "除却済み",
    progress: 1,
    current: "0",
    purchase: "89,500",
    status: "廃棄済",
    acquisitionDate: "2023-04-01",
    usefulLife: 5,
    businessRate: 1,
  },
];
