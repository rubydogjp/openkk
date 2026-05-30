import type { EntryRecord } from "../../entries/entry-record";

const FP_ID = "fp-example";

export const JOURNAL_EXAMPLE_FP_NAME = "サンプル期間 (2026年度)";

export const JOURNAL_EXAMPLE_ENTRIES: EntryRecord[] = [
  { id: "ex-01", fiscalPeriodId: FP_ID, date: "2026-01-05", weekday: "月", debit: "地代家賃", debitType: "expense", debitAmount: "46,920", credit: "普通預金", creditType: "asset", creditAmount: "46,920", description: "1月分", partner: "オフィス管理会社", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-02", fiscalPeriodId: FP_ID, date: "2026-01-15", weekday: "木", debit: "普通預金", debitType: "asset", debitAmount: "300,000", credit: "売上", creditType: "revenue", creditAmount: "300,000", description: "1月制作業務", partner: "サンプル取引先A", businessRate: "", taxCategory: "課税10%", businessCategory: "第5種" },
  { id: "ex-03", fiscalPeriodId: FP_ID, date: "2026-01-23", weekday: "金", debit: "通信費", debitType: "expense", debitAmount: "5,940", credit: "クレジットカード", creditType: "liability", creditAmount: "5,940", description: "1月分通信費", partner: "通信事業者A", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-04", fiscalPeriodId: FP_ID, date: "2026-02-05", weekday: "木", debit: "地代家賃", debitType: "expense", debitAmount: "46,920", credit: "普通預金", creditType: "asset", creditAmount: "46,920", description: "2月分", partner: "オフィス管理会社", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-05", fiscalPeriodId: FP_ID, date: "2026-02-18", weekday: "水", debit: "普通預金", debitType: "asset", debitAmount: "420,000", credit: "売上", creditType: "revenue", creditAmount: "420,000", description: "2月分業務", partner: "サンプル取引先B", businessRate: "", taxCategory: "課税10%", businessCategory: "第5種" },
  { id: "ex-06", fiscalPeriodId: FP_ID, date: "2026-02-22", weekday: "日", debit: "消耗品費", debitType: "expense", debitAmount: "18,420", credit: "クレジットカード", creditType: "liability", creditAmount: "18,420", description: "業務用品 (収録機材)", partner: "通販サイト", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-07", fiscalPeriodId: FP_ID, date: "2026-03-05", weekday: "木", debit: "地代家賃", debitType: "expense", debitAmount: "46,920", credit: "普通預金", creditType: "asset", creditAmount: "46,920", description: "3月分", partner: "オフィス管理会社", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-08", fiscalPeriodId: FP_ID, date: "2026-03-12", weekday: "木", debit: "売掛金", debitType: "asset", debitAmount: "460,000", credit: "売上", creditType: "revenue", creditAmount: "460,000", description: "3月分業務", partner: "サンプル取引先A", businessRate: "", taxCategory: "課税10%", businessCategory: "第5種" },
  { id: "ex-09", fiscalPeriodId: FP_ID, date: "2026-03-20", weekday: "金", debit: "旅費交通費", debitType: "expense", debitAmount: "24,800", credit: "クレジットカード", creditType: "liability", creditAmount: "24,800", description: "出張交通費", partner: "鉄道会社", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-10", fiscalPeriodId: FP_ID, date: "2026-03-25", weekday: "水", debit: "接待交際費", debitType: "expense", debitAmount: "8,800", credit: "現金", creditType: "asset", creditAmount: "8,800", description: "取引先打合せ", partner: "飲食店A", businessRate: "", taxCategory: "課税10%", businessCategory: "" },
  { id: "ex-11", fiscalPeriodId: FP_ID, date: "2026-12-25", weekday: "金", debit: "減価償却費", debitType: "expense", debitAmount: "63,450", credit: "工具器具備品", creditType: "asset", creditAmount: "63,450", description: "期末 PCの減価償却", partner: "業務用端末", businessRate: "", taxCategory: "対象外", businessCategory: "" },
];
