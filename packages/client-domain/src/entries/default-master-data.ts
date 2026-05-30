import type { EntryAccountVisualType } from "./entries-types";

export type DefaultBookAccount = {
  id: string;
  name: string;
  kana: string;
  accountType: EntryAccountVisualType;
  sortOrder: number;
};

export type DefaultTaxCategory = { id: string; name: string };
export type DefaultBusinessCategory = { id: string; name: string };

export const DEFAULT_BOOK_ACCOUNTS: DefaultBookAccount[] = [
  { id: "acc-cash", name: "現金", kana: "げんきん", accountType: "asset", sortOrder: 10 },
  { id: "acc-bank", name: "普通預金", kana: "ふつうよきん", accountType: "asset", sortOrder: 20 },
  { id: "acc-receivable", name: "売掛金", kana: "うりかけきん", accountType: "asset", sortOrder: 30 },
  { id: "acc-prepaid-expense", name: "前払費用", kana: "まえばらいひよう", accountType: "asset", sortOrder: 40 },
  { id: "acc-loan-receivable", name: "貸付金", kana: "かしつけきん", accountType: "asset", sortOrder: 50 },
  { id: "acc-suspense", name: "仮払金", kana: "かりばらいきん", accountType: "asset", sortOrder: 60 },
  { id: "acc-tools", name: "工具器具備品", kana: "こうぐきぐびひん", accountType: "asset", sortOrder: 70 },
  { id: "acc-building", name: "建物", kana: "たてもの", accountType: "asset", sortOrder: 80 },
  { id: "acc-vehicles", name: "車両運搬具", kana: "しゃりょううんぱんぐ", accountType: "asset", sortOrder: 90 },
  { id: "acc-owner-loan-to", name: "事業主貸", kana: "じぎょうぬしかし", accountType: "asset", sortOrder: 100 },

  { id: "acc-payable", name: "未払金", kana: "みばらいきん", accountType: "liability", sortOrder: 200 },
  { id: "acc-account-payable", name: "買掛金", kana: "かいかけきん", accountType: "liability", sortOrder: 210 },
  { id: "acc-loan", name: "借入金", kana: "かりいれきん", accountType: "liability", sortOrder: 220 },
  { id: "acc-deposits-received", name: "預り金", kana: "あずかりきん", accountType: "liability", sortOrder: 230 },
  { id: "acc-owner-loan-from", name: "事業主借", kana: "じぎょうぬしかり", accountType: "liability", sortOrder: 240 },

  { id: "acc-owner-equity", name: "元入金", kana: "もといれきん", accountType: "equity", sortOrder: 300 },

  { id: "acc-sales", name: "売上", kana: "うりあげ", accountType: "revenue", sortOrder: 400 },
  { id: "acc-misc-income", name: "雑収入", kana: "ざつしゅうにゅう", accountType: "revenue", sortOrder: 410 },

  { id: "acc-cogs", name: "仕入高", kana: "しいれだか", accountType: "cost_of_sales", sortOrder: 500 },

  { id: "acc-rent", name: "地代家賃", kana: "ちだいやちん", accountType: "expense", sortOrder: 600 },
  { id: "acc-comm", name: "通信費", kana: "つうしんひ", accountType: "expense", sortOrder: 610 },
  { id: "acc-travel", name: "旅費交通費", kana: "りょひこうつうひ", accountType: "expense", sortOrder: 620 },
  { id: "acc-consumables", name: "消耗品費", kana: "しょうもうひんひ", accountType: "expense", sortOrder: 630 },
  { id: "acc-utilities", name: "水道光熱費", kana: "すいどうこうねつひ", accountType: "expense", sortOrder: 640 },
  { id: "acc-entertain", name: "接待交際費", kana: "せったいこうさいひ", accountType: "expense", sortOrder: 650 },
  { id: "acc-shipping", name: "荷造運賃", kana: "にづくりうんちん", accountType: "expense", sortOrder: 660 },
  { id: "acc-advertising", name: "広告宣伝費", kana: "こうこくせんでんひ", accountType: "expense", sortOrder: 670 },
  { id: "acc-fee", name: "支払手数料", kana: "しはらいてすうりょう", accountType: "expense", sortOrder: 680 },
  { id: "acc-misc-expense", name: "雑費", kana: "ざっぴ", accountType: "expense", sortOrder: 690 },
  { id: "acc-depreciation", name: "減価償却費", kana: "げんかしょうきゃくひ", accountType: "expense", sortOrder: 700 },
];

export const DEFAULT_TAX_CATEGORIES: DefaultTaxCategory[] = [
  { id: "tax-10", name: "課税10%" },
  { id: "tax-8r", name: "軽減8%" },
  { id: "tax-out", name: "対象外" },
];

export const DEFAULT_BUSINESS_CATEGORIES: DefaultBusinessCategory[] = [
  { id: "biz-1", name: "第1種" },
  { id: "biz-2", name: "第2種" },
  { id: "biz-3", name: "第3種" },
  { id: "biz-4", name: "第4種" },
  { id: "biz-5", name: "第5種" },
  { id: "biz-6", name: "第6種" },
  { id: "biz-out", name: "対象外" },
];

export function mergeOptions(
  primary: Iterable<string>,
  secondary: Iterable<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...primary, ...secondary]) {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
