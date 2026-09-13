import type { MasterBookAccountType } from "./generated-master-data.js";

export type ClosingEntryLine = {
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type ClosingEntry = {
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: ClosingEntryLine[];
};

export type ClosingFixedAsset = {
  id: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessRate: number;
  status: "active" | "sold" | "disposed" | "retired";
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};

export type ClosingBookAccount = {
  id: string;
  accountType: MasterBookAccountType;
};

export type ClosingOpeningJournal = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: ClosingEntryLine[];
};

export const CLOSING_GENERATED_LOCAL_ID_PREFIX = "virtual:";
const TAX_OUT_OF_SCOPE = "tax_out_of_scope";
const BUSINESS_NONE = "biz_none";
const DEPRECIATION_EXPENSE = "acct_depreciation";
const BANK = "acct_bank";
const ASSET_SALE_GAIN = "acct_revenue_固定資産売却益";
const ASSET_SALE_LOSS = "acct_expense_固定資産売却損";
const ASSET_RETIREMENT_LOSS = "acct_expense_固定資産除却損";
const OWNER_WITHDRAWAL = "acct_proprietor_withdrawal";
const OWNER_LOAN = "acct_proprietor_loan";

export function buildExpectedClosingEntries(input: {
  periodStartDate: string;
  periodEndDate: string;
  entries: ClosingEntry[];
  fixedAssets: ClosingFixedAsset[];
  openingJournals: ClosingOpeningJournal[];
  bookAccounts: ClosingBookAccount[];
}): ClosingEntry[] {
  const openingEntries = input.openingJournals.map(
    (journal): ClosingEntry => ({
      date: journal.date,
      description: journal.description,
      localId: `${CLOSING_GENERATED_LOCAL_ID_PREFIX}virtual-opening-carryover-${journal.id}`,
      businessRate: journal.businessRate,
      lines: journal.lines.map((line) => ({ ...line })),
    }),
  );
  const fixedAssetEntries = input.fixedAssets.flatMap((asset) =>
    buildFixedAssetEntries(asset, input.periodStartDate, input.periodEndDate),
  );
  const assistEntries = [...openingEntries, ...fixedAssetEntries];
  const ordinaryEntries = input.entries.filter(
    (entry) =>
      !entry.localId?.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX),
  );
  const transfer = buildBusinessRateTransfer({
    date: input.periodEndDate,
    entries: [...ordinaryEntries, ...assistEntries],
    bookAccounts: input.bookAccounts,
  });
  return transfer == null ? assistEntries : [...assistEntries, transfer];
}

function buildFixedAssetEntries(
  asset: ClosingFixedAsset,
  periodStartDate: string,
  periodEndDate: string,
): ClosingEntry[] {
  const endDate =
    asset.status === "active" || asset.status === "retired"
      ? periodEndDate
      : asset.disposalDate;
  if (endDate == null) return [];
  const entries: ClosingEntry[] = [];
  const depreciation = computePeriodDepreciation({
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    periodStartDate,
    endDate,
  });
  if (depreciation > 0) {
    entries.push({
      date: endDate,
      description: `${asset.name}の減価償却`,
      localId: `${CLOSING_GENERATED_LOCAL_ID_PREFIX}virtual-fixed-asset-${asset.id}`,
      businessRate: asset.businessRate,
      lines: [
        line("debit", DEPRECIATION_EXPENSE, depreciation),
        line("credit", asset.bookAccountId, depreciation),
      ],
    });
  }
  if (asset.status !== "sold" && asset.status !== "disposed") return entries;

  const bookValue = computeDepreciationSnapshot({
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    asOf: endDate,
  }).currentBookValue;
  if (asset.status === "sold") {
    const disposalPrice = asset.disposalPrice;
    if (disposalPrice == null) {
      throw new Error(`sold fixed asset has no disposal price: ${asset.id}`);
    }
    const gain = Math.max(0, disposalPrice - bookValue);
    const loss = Math.max(0, bookValue - disposalPrice);
    const debits = [
      ...(disposalPrice > 0
        ? [line("debit", BANK, disposalPrice)]
        : []),
      ...(loss > 0 ? [line("debit", ASSET_SALE_LOSS, loss)] : []),
    ];
    const credits = [
      ...(bookValue > 0
        ? [line("credit", asset.bookAccountId, bookValue)]
        : []),
      ...(gain > 0 ? [line("credit", ASSET_SALE_GAIN, gain)] : []),
    ];
    if (debits.length > 0 || credits.length > 0) {
      entries.push({
        date: endDate,
        description: `${asset.name}の売却`,
        localId: `${CLOSING_GENERATED_LOCAL_ID_PREFIX}virtual-fixed-asset-sale-${asset.id}`,
        businessRate: asset.businessRate,
        lines: [...debits, ...credits],
      });
    }
  } else if (bookValue > 0) {
    entries.push({
      date: endDate,
      description: `${asset.name}の除却`,
      localId: `${CLOSING_GENERATED_LOCAL_ID_PREFIX}virtual-fixed-asset-retire-${asset.id}`,
      businessRate: asset.businessRate,
      lines: [
        line("debit", ASSET_RETIREMENT_LOSS, bookValue),
        line("credit", asset.bookAccountId, bookValue),
      ],
    });
  }
  return entries;
}

function buildBusinessRateTransfer(input: {
  date: string;
  entries: ClosingEntry[];
  bookAccounts: ClosingBookAccount[];
}): ClosingEntry | null {
  const accountTypeById = new Map(
    input.bookAccounts.map((account) => [account.id, account.accountType]),
  );
  const delta = new Map<string, number>();
  const fold = (accountId: string, amount: number) => {
    delta.set(accountId, (delta.get(accountId) ?? 0) + amount);
  };
  for (const entry of input.entries) {
    if (entry.businessRate >= 1) continue;
    for (const entryLine of entry.lines) {
      const type = accountTypeById.get(entryLine.bookAccountId);
      if (
        type !== "revenue" &&
        type !== "expense" &&
        type !== "cost_of_sales"
      ) {
        continue;
      }
      const businessAmount = Math.round(entryLine.amount * entry.businessRate);
      const personalAmount = entryLine.amount - businessAmount;
      if (personalAmount <= 0) continue;
      const sign = entryLine.side === "debit" ? 1 : -1;
      fold(entryLine.bookAccountId, -sign * personalAmount);
      fold(
        type === "revenue" ? OWNER_LOAN : OWNER_WITHDRAWAL,
        sign * personalAmount,
      );
    }
  }
  const lines: ClosingEntryLine[] = [];
  for (const [bookAccountId, signedAmount] of delta) {
    const amount = Math.round(signedAmount);
    if (amount === 0) continue;
    lines.push(
      line(amount > 0 ? "debit" : "credit", bookAccountId, Math.abs(amount)),
    );
  }
  if (lines.length === 0) return null;
  return {
    date: input.date,
    description: "家事按分の振替",
    localId: `${CLOSING_GENERATED_LOCAL_ID_PREFIX}business-rate-transfer`,
    businessRate: 1,
    lines,
  };
}

function line(
  side: ClosingEntryLine["side"],
  bookAccountId: string,
  amount: number,
): ClosingEntryLine {
  return {
    side,
    bookAccountId,
    amount,
    partnerName: "",
    taxCategoryId: TAX_OUT_OF_SCOPE,
    businessCategoryId: BUSINESS_NONE,
  };
}

function computePeriodDepreciation(input: {
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  periodStartDate: string;
  endDate: string;
}): number {
  const start = parseIsoLocalDate(input.periodStartDate);
  if (start == null) return 0;
  const dayBeforePeriod = new Date(start);
  dayBeforePeriod.setDate(dayBeforePeriod.getDate() - 1);
  const before = computeDepreciationSnapshot({
    ...input,
    asOf: formatIsoLocalDate(dayBeforePeriod),
  }).accumulated;
  const through = computeDepreciationSnapshot({
    ...input,
    asOf: input.endDate,
  }).accumulated;
  return Math.max(0, through - before);
}

function computeDepreciationSnapshot(input: {
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  asOf: string;
}) {
  const acquisition = parseIsoLocalDate(input.acquisitionDate);
  const asOf = parseIsoLocalDate(input.asOf);
  const cost = Math.max(0, Math.round(input.acquisitionCost));
  const totalMonths = Math.min(
    1200,
    Math.max(1, Math.floor(input.usefulLife) || 1) * 12,
  );
  const rawElapsed =
    acquisition == null || asOf == null
      ? 0
      : asOf.getFullYear() * 12 +
        asOf.getMonth() -
        (acquisition.getFullYear() * 12 + acquisition.getMonth()) +
        1;
  const elapsedMonths = Number.isFinite(rawElapsed)
    ? Math.max(0, Math.min(totalMonths, rawElapsed))
    : 0;
  const depreciableAmount = Math.max(0, cost - (cost > 0 ? 1 : 0));
  const accumulated = Math.min(
    depreciableAmount,
    Math.floor((depreciableAmount * elapsedMonths) / totalMonths),
  );
  return {
    accumulated,
    currentBookValue: Math.max(cost > 0 ? 1 : 0, cost - accumulated),
  };
}

export function computeFixedAssetBookValue(input: {
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  asOf: string;
}): number {
  return computeDepreciationSnapshot(input).currentBookValue;
}

function parseIsoLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function formatIsoLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
