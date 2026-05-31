import type { EntryAccountVisualType, EntryPreviewRow } from "./entries-types";

export type EntryLine = {
  side: "debit" | "credit";
  accountName: string;
  accountType: EntryAccountVisualType;
  amount: string;
  bookAccountId?: string;
};

export type EntryRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  weekday: string;

  lines?: EntryLine[];

  debit: string;
  debitType: EntryPreviewRow["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryPreviewRow["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  localId?: string;
  debitBookAccountId?: string;
  creditBookAccountId?: string;
  debitTaxCategoryId?: string;
  creditTaxCategoryId?: string;
  debitBusinessCategoryId?: string;
  creditBusinessCategoryId?: string;
};

export function getEntryLines(record: EntryRecord): EntryLine[] {
  if (record.lines != null && record.lines.length > 0) {
    return record.lines;
  }
  return [
    {
      side: "debit",
      accountName: record.debit,
      accountType: record.debitType,
      amount: record.debitAmount,
      bookAccountId: record.debitBookAccountId,
    },
    {
      side: "credit",
      accountName: record.credit,
      accountType: record.creditType,
      amount: record.creditAmount,
      bookAccountId: record.creditBookAccountId,
    },
  ];
}

export function entryToVisualPairs(
  record: EntryRecord,
): Array<{
  debit: EntryLine | null;
  credit: EntryLine | null;
}> {
  const lines = getEntryLines(record);
  const debits = lines.filter((line) => line.side === "debit");
  const credits = lines.filter((line) => line.side === "credit");
  const rowCount = Math.max(debits.length, credits.length, 1);
  const pairs: Array<{ debit: EntryLine | null; credit: EntryLine | null }> = [];
  for (let index = 0; index < rowCount; index += 1) {
    pairs.push({
      debit: debits[index] ?? null,
      credit: credits[index] ?? null,
    });
  }
  return pairs;
}

export function buildBootstrapEntries(): EntryRecord[] {
  return [
    { id: "entry-2026-01-sales", fiscalPeriodId: "fp-2026", date: "2026-01-20", weekday: "火", debit: "普通預金", debitType: "asset", debitAmount: "520,000", credit: "売上", creditType: "revenue", creditAmount: "520,000", description: "Web制作業務 - A社", partner: "サンプル取引先A", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-01-purchase", fiscalPeriodId: "fp-2026", date: "2026-01-12", weekday: "月", debit: "仕入", debitType: "cost_of_sales", debitAmount: "182,000", credit: "普通預金", creditType: "asset", creditAmount: "182,000", description: "案件素材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-01-rent", fiscalPeriodId: "fp-2026", date: "2026-01-27", weekday: "火", debit: "地代家賃", debitType: "expense", debitAmount: "32,000", credit: "普通預金", creditType: "asset", creditAmount: "32,000", description: "作業場賃料 1月分", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-01-communication", fiscalPeriodId: "fp-2026", date: "2026-01-30", weekday: "金", debit: "通信費", debitType: "expense", debitAmount: "18,000", credit: "普通預金", creditType: "asset", creditAmount: "18,000", description: "クラウドツール利用料", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-02-sales", fiscalPeriodId: "fp-2026", date: "2026-02-18", weekday: "水", debit: "普通預金", debitType: "asset", debitAmount: "480,000", credit: "売上", creditType: "revenue", creditAmount: "480,000", description: "保守運用業務 - A社", partner: "サンプル取引先A", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-02-server", fiscalPeriodId: "fp-2026", date: "2026-02-10", weekday: "火", debit: "通信費", debitType: "expense", debitAmount: "12,000", credit: "普通預金", creditType: "asset", creditAmount: "12,000", description: "レンタルサーバー代", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-02-purchase", fiscalPeriodId: "fp-2026", date: "2026-02-08", weekday: "日", debit: "仕入", debitType: "cost_of_sales", debitAmount: "596,000", credit: "普通預金", creditType: "asset", creditAmount: "596,000", description: "大型案件素材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-02-rent", fiscalPeriodId: "fp-2026", date: "2026-02-26", weekday: "木", debit: "地代家賃", debitType: "expense", debitAmount: "34,000", credit: "普通預金", creditType: "asset", creditAmount: "34,000", description: "作業場賃料 2月分", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-02-travel", fiscalPeriodId: "fp-2026", date: "2026-02-21", weekday: "土", debit: "旅費交通費", debitType: "expense", debitAmount: "58,000", credit: "普通預金", creditType: "asset", creditAmount: "58,000", description: "クライアント訪問の交通費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-03-sales", fiscalPeriodId: "fp-2026", date: "2026-03-12", weekday: "木", debit: "売掛金", debitType: "asset", debitAmount: "460,000", credit: "売上", creditType: "revenue", creditAmount: "460,000", description: "商品制作 - B商店", partner: "サンプル取引先B", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-03-rent", fiscalPeriodId: "fp-2026", date: "2026-03-25", weekday: "水", debit: "地代家賃", debitType: "expense", debitAmount: "21,000", credit: "普通預金", creditType: "asset", creditAmount: "21,000", description: "共同オフィス利用料", partner: "共同オフィスA", businessRate: "50", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-03-purchase", fiscalPeriodId: "fp-2026", date: "2026-03-08", weekday: "日", debit: "仕入", debitType: "cost_of_sales", debitAmount: "382,000", credit: "普通預金", creditType: "asset", creditAmount: "382,000", description: "春商材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-03-communication", fiscalPeriodId: "fp-2026", date: "2026-03-18", weekday: "水", debit: "通信費", debitType: "expense", debitAmount: "52,000", credit: "普通預金", creditType: "asset", creditAmount: "52,000", description: "広告運用ツール利用料", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-03-travel", fiscalPeriodId: "fp-2026", date: "2026-03-20", weekday: "金", debit: "旅費交通費", debitType: "expense", debitAmount: "24,000", credit: "普通預金", creditType: "asset", creditAmount: "24,000", description: "展示会出展の交通費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-04-sales", fiscalPeriodId: "fp-2026", date: "2026-04-18", weekday: "土", debit: "普通預金", debitType: "asset", debitAmount: "510,000", credit: "売上", creditType: "revenue", creditAmount: "510,000", description: "運用支援業務 - C社", partner: "DELTA商事", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-04-monitor", fiscalPeriodId: "fp-2026", date: "2026-04-03", weekday: "金", debit: "工具器具備品", debitType: "asset", debitAmount: "62,800", credit: "普通預金", creditType: "asset", creditAmount: "62,800", description: "4Kモニター購入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-04-purchase", fiscalPeriodId: "fp-2026", date: "2026-04-20", weekday: "月", debit: "仕入", debitType: "cost_of_sales", debitAmount: "240,000", credit: "普通預金", creditType: "asset", creditAmount: "240,000", description: "外注素材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-05-sales", fiscalPeriodId: "fp-2026", date: "2026-05-14", weekday: "木", debit: "普通預金", debitType: "asset", debitAmount: "470,000", credit: "売上", creditType: "revenue", creditAmount: "470,000", description: "ECサイト改修 - A社", partner: "サンプル取引先A", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-05-purchase", fiscalPeriodId: "fp-2026", date: "2026-05-09", weekday: "土", debit: "仕入", debitType: "cost_of_sales", debitAmount: "428,000", credit: "普通預金", creditType: "asset", creditAmount: "428,000", description: "動画制作素材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-05-rent", fiscalPeriodId: "fp-2026", date: "2026-05-27", weekday: "水", debit: "地代家賃", debitType: "expense", debitAmount: "58,000", credit: "普通預金", creditType: "asset", creditAmount: "58,000", description: "作業場賃料 5月分", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-05-travel", fiscalPeriodId: "fp-2026", date: "2026-05-22", weekday: "金", debit: "旅費交通費", debitType: "expense", debitAmount: "72,000", credit: "普通預金", creditType: "asset", creditAmount: "72,000", description: "撮影立会いの交通費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-06-sales", fiscalPeriodId: "fp-2026", date: "2026-06-21", weekday: "日", debit: "普通預金", debitType: "asset", debitAmount: "560,000", credit: "売上", creditType: "revenue", creditAmount: "560,000", description: "月次運用 - B商店", partner: "サンプル取引先B", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-06-communication", fiscalPeriodId: "fp-2026", date: "2026-06-06", weekday: "土", debit: "通信費", debitType: "expense", debitAmount: "42,000", credit: "普通預金", creditType: "asset", creditAmount: "42,000", description: "クラウドツールと回線費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-06-travel", fiscalPeriodId: "fp-2026", date: "2026-06-24", weekday: "水", debit: "旅費交通費", debitType: "expense", debitAmount: "36,000", credit: "普通預金", creditType: "asset", creditAmount: "36,000", description: "地方出張の交通費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-06-purchase", fiscalPeriodId: "fp-2026", date: "2026-06-10", weekday: "水", debit: "仕入", debitType: "cost_of_sales", debitAmount: "218,000", credit: "普通預金", creditType: "asset", creditAmount: "218,000", description: "夏案件素材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-07-sales", fiscalPeriodId: "fp-2026", date: "2026-07-16", weekday: "木", debit: "普通預金", debitType: "asset", debitAmount: "700,000", credit: "売上", creditType: "revenue", creditAmount: "700,000", description: "大型LP制作 - C社", partner: "DELTA商事", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-07-purchase", fiscalPeriodId: "fp-2026", date: "2026-07-08", weekday: "水", debit: "仕入", debitType: "cost_of_sales", debitAmount: "176,000", credit: "普通預金", creditType: "asset", creditAmount: "176,000", description: "案件用商品の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-07-shipping", fiscalPeriodId: "fp-2026", date: "2026-07-28", weekday: "火", debit: "荷造運賃", debitType: "expense", debitAmount: "28,000", credit: "現金", creditType: "asset", creditAmount: "28,000", description: "納品物の発送費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-07-rent", fiscalPeriodId: "fp-2026", date: "2026-07-26", weekday: "日", debit: "地代家賃", debitType: "expense", debitAmount: "32,000", credit: "普通預金", creditType: "asset", creditAmount: "32,000", description: "作業場賃料 7月分", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-08-sales", fiscalPeriodId: "fp-2026", date: "2026-08-19", weekday: "水", debit: "普通預金", debitType: "asset", debitAmount: "630,000", credit: "売上", creditType: "revenue", creditAmount: "630,000", description: "継続改善業務 - A社", partner: "サンプル取引先A", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    { id: "entry-2026-08-income", fiscalPeriodId: "fp-2026", date: "2026-08-27", weekday: "木", debit: "普通預金", debitType: "asset", debitAmount: "20,000", credit: "雑収入", creditType: "revenue", creditAmount: "20,000", description: "小規模事業者向け補助金", partner: "", businessRate: "", taxCategory: "対象外", businessCategory: "" },
    { id: "entry-2026-08-rent", fiscalPeriodId: "fp-2026", date: "2026-08-25", weekday: "火", debit: "地代家賃", debitType: "expense", debitAmount: "36,000", credit: "普通預金", creditType: "asset", creditAmount: "36,000", description: "作業場賃料 8月分", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-08-purchase", fiscalPeriodId: "fp-2026", date: "2026-08-09", weekday: "日", debit: "仕入", debitType: "cost_of_sales", debitAmount: "212,000", credit: "普通預金", creditType: "asset", creditAmount: "212,000", description: "秋前商材の仕入", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-08-communication", fiscalPeriodId: "fp-2026", date: "2026-08-29", weekday: "土", debit: "通信費", debitType: "expense", debitAmount: "42,000", credit: "普通預金", creditType: "asset", creditAmount: "42,000", description: "広告運用と通信費", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-09-sales", fiscalPeriodId: "fp-2026", date: "2026-09-11", weekday: "金", debit: "普通預金", debitType: "asset", debitAmount: "500,000", credit: "売上", creditType: "revenue", creditAmount: "500,000", description: "秋キャンペーン制作 - B商店", partner: "サンプル取引先B", businessRate: "", taxCategory: "課税 10%", businessCategory: "第5種（サービス業等）" },
    {
      id: "entry-2026-09-purchase",
      fiscalPeriodId: "fp-2026",
      date: "2026-09-05",
      weekday: "土",
      lines: [
        {
          side: "debit",
          accountName: "仕入",
          accountType: "cost_of_sales",
          amount: "168,000",
          bookAccountId: "acct_cost_of_sales_商品仕入高",
        },
        {
          side: "debit",
          accountName: "荷造運賃",
          accountType: "expense",
          amount: "42,000",
          bookAccountId: "acct_expense_荷造運賃",
        },
        {
          side: "credit",
          accountName: "未払金",
          accountType: "liability",
          amount: "210,000",
          bookAccountId: "acct_accrued_expense",
        },
      ],
      debit: "仕入",
      debitType: "cost_of_sales",
      debitAmount: "168,000",
      credit: "未払金",
      creditType: "liability",
      creditAmount: "210,000",
      description: "秋商材の仕入と配送費",
      partner: "",
      businessRate: "",
      taxCategory: "課税 10%",
      businessCategory: "",
    },
    { id: "entry-2026-09-rent", fiscalPeriodId: "fp-2026", date: "2026-09-26", weekday: "土", debit: "地代家賃", debitType: "expense", debitAmount: "22,000", credit: "普通預金", creditType: "asset", creditAmount: "22,000", description: "作業場賃料 9月分", partner: "共同オフィスA", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-09-travel", fiscalPeriodId: "fp-2026", date: "2026-09-15", weekday: "火", debit: "旅費交通費", debitType: "expense", debitAmount: "12,000", credit: "普通預金", creditType: "asset", creditAmount: "12,000", description: "展示会出展の交通費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
    { id: "entry-2026-09-communication", fiscalPeriodId: "fp-2026", date: "2026-09-29", weekday: "火", debit: "通信費", debitType: "expense", debitAmount: "6,000", credit: "普通預金", creditType: "asset", creditAmount: "6,000", description: "広告運用ツールと通信費", partner: "", businessRate: "", taxCategory: "課税 10%", businessCategory: "" },
  ];
}

export function buildDemoSeedEntriesForFiscalPeriod(
  fiscalPeriodId: string,
): EntryRecord[] {
  return buildBootstrapEntries().map((record) => ({
    ...record,
    id: `${record.id}-${fiscalPeriodId}`,
    fiscalPeriodId,
  }));
}

export function recordToPreviewRows(
  record: EntryRecord,
): EntryPreviewRow[] {
  const pairs = entryToVisualPairs(record);
  const dateLabel = `${record.date.slice(5, 7)}/${record.date.slice(8, 10)}`;
  return pairs.map((pair, index) => ({
    recordId: record.id,
    lineIndex: index,
    lineCount: pairs.length,
    isFirstOfRecord: index === 0,
    date: dateLabel,
    weekday: record.weekday,
    debit: pair.debit?.accountName ?? "",
    debitType: pair.debit?.accountType ?? "asset",
    debitAmount: pair.debit?.amount ?? "",
    credit: pair.credit?.accountName ?? "",
    creditType: pair.credit?.accountType ?? "asset",
    creditAmount: pair.credit?.amount ?? "",
    description: record.description,
    partner: record.partner,
    businessRate: record.businessRate,
    taxCategory: record.taxCategory,
    businessCategory: record.businessCategory,
  }));
}

export function recordToPreviewRow(record: EntryRecord): EntryPreviewRow {
  const rows = recordToPreviewRows(record);
  return rows[0]!;
}
