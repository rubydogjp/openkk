import type {
  EntryLine,
  EntryRecord,
} from "../../entries/entry-record.js";
import type { BookAccountType } from "../../entries/book-account.js";

const FISCAL_PERIOD_ID = "fp-example";

type ExampleEntry = {
  id: string;
  date: string;
  weekday: string;
  debit: [name: string, type: BookAccountType];
  credit: [name: string, type: BookAccountType];
  amount: string;
  description: string;
  partner: string;
  taxCategory: string;
  businessCategory: string;
};

function exampleEntry(input: ExampleEntry): EntryRecord {
  const line = (
    side: EntryLine["side"],
    [accountName, accountType]: ExampleEntry["debit"],
  ): EntryLine => ({
    id: null,
    side,
    accountName,
    accountType,
    amount: input.amount,
    bookAccountId: null,
    partnerName: input.partner,
    taxCategoryId: null,
    taxCategoryName: input.taxCategory,
    businessCategoryId: null,
    businessCategoryName: input.businessCategory,
  });
  return {
    id: input.id,
    fiscalPeriodId: FISCAL_PERIOD_ID,
    date: input.date,
    weekday: input.weekday,
    lines: [line("debit", input.debit), line("credit", input.credit)],
    description: input.description,
    businessRate: 1,
    localId: null,
  };
}

export const JOURNAL_EXAMPLE_FP_NAME = "サンプル期間 (2026年度)";

export const JOURNAL_EXAMPLE_ENTRIES: EntryRecord[] = [
  exampleEntry({
    id: "ex-01",
    date: "2026-01-05",
    weekday: "月",
    debit: ["地代家賃", "expense"],
    credit: ["普通預金", "asset"],
    amount: "46,920",
    description: "1月分",
    partner: "オフィス管理会社",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-02",
    date: "2026-01-15",
    weekday: "木",
    debit: ["普通預金", "asset"],
    credit: ["売上", "revenue"],
    amount: "300,000",
    description: "1月制作業務",
    partner: "サンプル取引先A",
    taxCategory: "課税 10%",
    businessCategory: "第5種（サービス業等）",
  }),
  exampleEntry({
    id: "ex-03",
    date: "2026-01-23",
    weekday: "金",
    debit: ["通信費", "expense"],
    credit: ["クレジットカード", "liability"],
    amount: "5,940",
    description: "1月分通信費",
    partner: "通信事業者A",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-04",
    date: "2026-02-05",
    weekday: "木",
    debit: ["地代家賃", "expense"],
    credit: ["普通預金", "asset"],
    amount: "46,920",
    description: "2月分",
    partner: "オフィス管理会社",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-05",
    date: "2026-02-18",
    weekday: "水",
    debit: ["普通預金", "asset"],
    credit: ["売上", "revenue"],
    amount: "420,000",
    description: "2月分業務",
    partner: "サンプル取引先B",
    taxCategory: "課税 10%",
    businessCategory: "第5種（サービス業等）",
  }),
  exampleEntry({
    id: "ex-06",
    date: "2026-02-22",
    weekday: "日",
    debit: ["消耗品費", "expense"],
    credit: ["クレジットカード", "liability"],
    amount: "18,420",
    description: "業務用品 (収録機材)",
    partner: "通販サイト",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-07",
    date: "2026-03-05",
    weekday: "木",
    debit: ["地代家賃", "expense"],
    credit: ["普通預金", "asset"],
    amount: "46,920",
    description: "3月分",
    partner: "オフィス管理会社",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-08",
    date: "2026-03-12",
    weekday: "木",
    debit: ["売掛金", "asset"],
    credit: ["売上", "revenue"],
    amount: "460,000",
    description: "3月分業務",
    partner: "サンプル取引先A",
    taxCategory: "課税 10%",
    businessCategory: "第5種（サービス業等）",
  }),
  exampleEntry({
    id: "ex-09",
    date: "2026-03-20",
    weekday: "金",
    debit: ["旅費交通費", "expense"],
    credit: ["クレジットカード", "liability"],
    amount: "24,800",
    description: "出張交通費",
    partner: "鉄道会社",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-10",
    date: "2026-03-25",
    weekday: "水",
    debit: ["接待交際費", "expense"],
    credit: ["現金", "asset"],
    amount: "8,800",
    description: "取引先打合せ",
    partner: "飲食店A",
    taxCategory: "課税 10%",
    businessCategory: "",
  }),
  exampleEntry({
    id: "ex-11",
    date: "2026-12-25",
    weekday: "金",
    debit: ["減価償却費", "expense"],
    credit: ["工具器具備品", "asset"],
    amount: "63,450",
    description: "期末 PCの減価償却",
    partner: "業務用端末",
    taxCategory: "対象外",
    businessCategory: "",
  }),
];
