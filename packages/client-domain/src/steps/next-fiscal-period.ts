import {
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
} from "../entries/default-master-data.js";
import { type EntryLine, type EntryRecord } from "../entries/entry-record.js";
import { parseAmount, parseIsoLocalDate } from "../shared/parse-utils.js";
import { resolveCategoryId } from "../entries/category-resolution.js";
import {
  resolveBookAccountId,
  type BookAccount,
} from "../entries/book-account.js";
import { AppError } from "../shared/app-error.js";

export type NextFiscalPeriodSuggestion = {
  name: string;
  startDate: string;
  endDate: string;
};

export function buildNextFiscalPeriodSuggestion(input: {
  startDate: string;
  endDate: string;
}): NextFiscalPeriodSuggestion {
  const startDate = addDaysToIsoDate(input.endDate, 1) ?? input.endDate;
  const endDate = addYearsToIsoDate(input.endDate, 1) ?? input.endDate;
  return {
    name: `${endDate.slice(0, 4)}年分`,
    startDate,
    endDate,
  };
}

function addDaysToIsoDate(value: string, days: number): string | null {
  const date = parseIsoLocalDate(value);
  if (date == null) return null;
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

type OpeningCarryoverJournal = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: Array<{
    id: string;
    side: "debit" | "credit";
    bookAccountId: string;
    amount: number;
    partnerName: string;
    taxCategoryId: string;
    businessCategoryId: string;
  }>;
};

const REVERSIBLE_BALANCE_ACCOUNTS = new Set([
  "未収入金",
  "未収収益",
  "前払金",
  "前払費用",
  "棚卸資産",
  "商品",
  "製品",
  "原材料",
  "仕掛品",
  "貯蔵品",
  "未払金",
  "未払費用",
  "前受金",
  "前受収益",
]);

const PROFIT_LOSS_TYPES = new Set(["revenue", "expense", "cost_of_sales"]);

export function buildOpeningCarryoverJournalsFromReversibleEntries(input: {
  entries: EntryRecord[];
  accounts: ReadonlyArray<BookAccount>;
  nextFiscalPeriodId: string;
  nextStartDate: string;
}): OpeningCarryoverJournal[] {
  const journals: OpeningCarryoverJournal[] = [];

  for (const entry of input.entries) {
    const lines = entry.lines;
    if (!areEntryLinesBalanced(lines)) continue;
    const balanceLines = lines.filter(isReversibleBalanceLine);
    const profitLossLines = lines.filter((line) =>
      PROFIT_LOSS_TYPES.has(line.accountType),
    );

    for (const pair of matchReversiblePairs(balanceLines, profitLossLines)) {
      const journalId = `oc-${input.nextFiscalPeriodId}-${entry.id}-${journals.length + 1}`;
      const reversedBalanceLine = reverseLine(pair.balanceLine, pair.amount);
      const reversedProfitLossLine = reverseLine(
        pair.profitLossLine,
        pair.amount,
      );
      journals.push({
        id: journalId,
        date: input.nextStartDate,
        description: `再振替: ${entry.description}`,
        businessRate: entry.businessRate,
        lines: [
          toOpeningJournalLine(
            `${journalId}-b`,
            reversedBalanceLine,
            input.accounts,
          ),
          toOpeningJournalLine(
            `${journalId}-p`,
            reversedProfitLossLine,
            input.accounts,
          ),
        ],
      });
    }
  }

  return journals;
}

function isReversibleBalanceLine(line: EntryLine): boolean {
  return (
    (line.accountType === "asset" || line.accountType === "liability") &&
    REVERSIBLE_BALANCE_ACCOUNTS.has(line.accountName)
  );
}

function reverseLine(line: EntryLine, amount: number): EntryLine {
  return {
    ...line,
    side: line.side === "debit" ? "credit" : "debit",
    amount: new Intl.NumberFormat("ja-JP").format(amount),
  };
}

function areEntryLinesBalanced(lines: EntryLine[]): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    const amount = parseAmount(line.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    if (line.side === "debit") debitTotal += amount;
    else creditTotal += amount;
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      return false;
    }
  }
  return debitTotal > 0 && debitTotal === creditTotal;
}

function matchReversiblePairs(
  balanceLines: EntryLine[],
  profitLossLines: EntryLine[],
): Array<{
  balanceLine: EntryLine;
  profitLossLine: EntryLine;
  amount: number;
}> {
  const remainingBalanceLines = balanceLines
    .map((line) => ({ line, remaining: parseAmount(line.amount) }))
    .filter((item) => item.remaining > 0);
  const remainingProfitLossLines = profitLossLines
    .map((line) => ({ line, remaining: parseAmount(line.amount) }))
    .filter((item) => item.remaining > 0);
  const pairs: Array<{
    balanceLine: EntryLine;
    profitLossLine: EntryLine;
    amount: number;
  }> = [];

  for (const balance of remainingBalanceLines) {
    while (balance.remaining > 0) {
      const profitLoss = remainingProfitLossLines.find(
        (item) => item.remaining > 0 && item.line.side !== balance.line.side,
      );
      if (profitLoss == null) break;

      const amount = Math.min(balance.remaining, profitLoss.remaining);
      pairs.push({
        balanceLine: balance.line,
        profitLossLine: profitLoss.line,
        amount,
      });
      balance.remaining -= amount;
      profitLoss.remaining -= amount;
    }
  }

  return pairs;
}

function toOpeningJournalLine(
  id: string,
  line: EntryLine,
  accounts: ReadonlyArray<BookAccount>,
): OpeningCarryoverJournal["lines"][number] {
  const bookAccountId = resolveBookAccountId({
    explicitId: line.bookAccountId,
    accountName: line.accountName,
    accountType: line.accountType,
    accounts,
  });
  if (bookAccountId == null) {
    throw new AppError({
      messageForDeveloper:
        "Opening carryover book account cannot be resolved: " +
        line.accountName,
      messageForUser: "再振替の勘定科目を特定できませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return {
    id,
    side: line.side,
    bookAccountId,
    amount: parseAmount(line.amount),
    partnerName: line.partnerName ?? "",
    taxCategoryId: resolveCategoryId(
      line.taxCategoryId,
      line.taxCategoryName ?? "",
      DEFAULT_TAX_CATEGORIES,
      "tax_out_of_scope",
    ),
    businessCategoryId: resolveCategoryId(
      line.businessCategoryId,
      line.businessCategoryName ?? "",
      DEFAULT_BUSINESS_CATEGORIES,
      "biz_none",
    ),
  };
}

function addYearsToIsoDate(value: string, years: number): string | null {
  const date = parseIsoLocalDate(value);
  if (date == null) return null;
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  const day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
  return [
    String(year).padStart(4, "0"),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
