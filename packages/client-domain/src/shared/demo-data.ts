import type { OpenkkConfig } from "./openkk-config";
import type { FiscalPeriod, Session } from "./models";
import { DEFAULT_BOOK_ACCOUNTS } from "../entries/default-master-data";

function bookAccountIdByName(name: string): string {
  return DEFAULT_BOOK_ACCOUNTS.find((acc) => acc.name === name)?.id ?? name;
}

function buildDemoOpeningJournals(fiscalPeriodId: string) {
  const fiscalYear = fiscalPeriodId.slice(3, 7);
  const date = `${fiscalYear}-01-01`;
  const demoRows = [
    {
      description: "期首再振替 売掛金",
      debit: "売掛金",
      credit: "売上",
      amount: 240000,
      partner: "",
      biz: "",
    },
    {
      description: "期首再振替 未収入金",
      debit: "未収入金",
      credit: "雑収入",
      amount: 64000,
      partner: "",
      biz: "",
    },
    {
      description: "期首再振替 商品",
      debit: "商品",
      credit: "仕入",
      amount: 150000,
      partner: "",
      biz: "",
    },
    {
      description: "期首再振替 貯蔵品",
      debit: "消耗品費",
      credit: "貯蔵品",
      amount: 28000,
      partner: "",
      biz: "",
    },
    {
      description: "期首再振替 未払金",
      debit: "地代家賃",
      credit: "未払金",
      amount: 120000,
      partner: "共同オフィスA",
      biz: "",
    },
    {
      description: "期首再振替 前受金",
      debit: "前受金",
      credit: "売上",
      amount: 48000,
      partner: "",
      biz: "第5種（サービス業等）",
    },
  ];
  return demoRows.map((row, index) => {
    const id = `oc-${fiscalPeriodId}-${index + 1}`;
    return {
      id,
      date,
      description: row.description,
      businessRate: 1,
      lines: [
        {
          id: `${id}-d`,
          side: "debit" as const,
          bookAccountId: bookAccountIdByName(row.debit),
          amount: row.amount,
          partnerName: row.partner,
          taxCategoryName: "対象外",
          businessCategoryName: row.biz,
        },
        {
          id: `${id}-c`,
          side: "credit" as const,
          bookAccountId: bookAccountIdByName(row.credit),
          amount: row.amount,
          partnerName: row.partner,
          taxCategoryName: "対象外",
          businessCategoryName: row.biz,
        },
      ],
    };
  });
}

export const demoOpeningBalanceLines = [
  { id: "cash", accountId: "a:現金", amount: 320000 },
  { id: "bank", accountId: "a:その他の預金", amount: 1800000 },
  { id: "receivable", accountId: "a:売掛金", amount: 240000 },
  { id: "accrued_revenue", accountId: "a:未収入金", amount: 64000 },
  { id: "inventory", accountId: "a:棚卸資産", amount: 150000 },
  { id: "stored_supplies", accountId: "a:貯蔵品", amount: 28000 },
  { id: "payable", accountId: "l:買掛金", amount: 120000 },
  { id: "advance_received", accountId: "l:前受金", amount: 48000 },
  { id: "borrowing", accountId: "l:借入金", amount: 600000 },
  { id: "capital", accountId: "l:元入金", amount: 1834000 },
];

export const demoOpeningDebitTotal = demoOpeningBalanceLines
  .filter((line) => line.accountId.startsWith("a:"))
  .reduce((sum, line) => sum + line.amount, 0);

export const demoOpeningCreditTotal = demoOpeningBalanceLines
  .filter((line) => line.accountId.startsWith("l:"))
  .reduce((sum, line) => sum + line.amount, 0);

function buildDemoFiscalPeriod2026(
  userId: string,
  name: string,
  progress: "in-progress" | "fresh",
): FiscalPeriod {
  const isInProgress = progress === "in-progress";
  return {
    id: "fp-2026",
    name,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: isInProgress ? "journalizing" : "pre_opening",
    archiveStatus: "active",
    settingsCompleted: isInProgress,
    openingBalancesCompleted: isInProgress,
    documentsReceivedCompleted: false,
    openingDebitTotal: demoOpeningDebitTotal,
    openingCreditTotal: demoOpeningCreditTotal,
    opening: {
      id: "opening-fp-2026",
      userId,
      fiscalPeriodId: "fp-2026",

      openingBalanceLines: demoOpeningBalanceLines,

      openingJournals: isInProgress ? buildDemoOpeningJournals("fp-2026") : [],
    },
  };
}

export function buildDemoSession(
  config: OpenkkConfig,
  userId?: string,
): Session {
  return {
    userId: userId ?? config.mockUserId,
    displayName:
      config.mode === "demo"
        ? "デモユーザー"
        : config.mode === "dev"
          ? "開発ユーザー"
          : "このPCに保存",
    email: "サインインなし",
  };
}

export function buildBootstrapFiscalPeriods(
  config: OpenkkConfig,
): FiscalPeriod[] {
  return config.mode === "demo"
    ? [
        buildDemoFiscalPeriod2026(
          config.mockUserId,
          "デモ期間2026年分",
          "fresh",
        ),
      ]
    : [buildDemoFiscalPeriod2026(config.mockUserId, "2026年分", "in-progress")];
}

export function buildBootstrapSessionUserId(
  config: OpenkkConfig,
): string | null {
  return config.initialMockUserId;
}

export function buildBootstrapFiscalPeriodId(
  config: OpenkkConfig,
): string | null {
  return config.initialMockFiscalPeriodId;
}

export function buildSignedOutFiscalPeriodId(
  config: OpenkkConfig,
): string | null {
  return config.mode === "dev" ? config.initialMockFiscalPeriodId : null;
}
