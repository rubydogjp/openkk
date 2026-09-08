import {
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
} from "../entries/default-master-data.js";
import {
  getEntryLines,
  resolveEntryBusinessRate,
  type EntryLine,
  type EntryRecord,
} from "../entries/entry-record.js";
import { parseAmount, parseIsoLocalDate } from "../shared/parse-utils.js";

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
  nextFiscalPeriodId: string;
  nextStartDate: string;
}): OpeningCarryoverJournal[] {
  const journals: OpeningCarryoverJournal[] = [];

  for (const entry of input.entries) {
    const lines = getEntryLines(entry);
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
        businessRate: resolveEntryBusinessRate(entry),
        lines: [
          toOpeningJournalLine(`${journalId}-b`, reversedBalanceLine, entry),
          toOpeningJournalLine(`${journalId}-p`, reversedProfitLossLine, entry),
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
    if (!Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal)) {
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
  entry: EntryRecord,
): OpeningCarryoverJournal["lines"][number] {
  return {
    id,
    side: line.side,
    bookAccountId: resolveBookAccountId(line),
    amount: parseAmount(line.amount),
    partnerName: line.partnerName ?? entry.partner,
    taxCategoryId: resolveCategoryId({
      explicitId:
        line.taxCategoryId ??
        (line.side === "debit"
          ? entry.debitTaxCategoryId
          : entry.creditTaxCategoryId),
      displayValue: entry.taxCategory,
      categories: DEFAULT_TAX_CATEGORIES,
      blankFallbackId: "tax_out_of_scope",
    }),
    businessCategoryId: resolveCategoryId({
      explicitId:
        line.businessCategoryId ??
        (line.side === "debit"
          ? entry.debitBusinessCategoryId
          : entry.creditBusinessCategoryId),
      displayValue: entry.businessCategory,
      categories: DEFAULT_BUSINESS_CATEGORIES,
      blankFallbackId: "biz_none",
    }),
  };
}

function resolveCategoryId(input: {
  explicitId: string | null;
  displayValue: string;
  categories: Array<{ id: string; name: string }>;
  blankFallbackId: string;
}): string {
  const explicit = input.explicitId?.trim() ?? "";
  if (explicit !== "") {
    return (
      input.categories.find(
        (category) =>
          category.id === explicit || category.name === explicit,
      )?.id ?? explicit
    );
  }
  const display = input.displayValue.trim();
  if (display === "") return input.blankFallbackId;
  return (
    input.categories.find(
      (category) => category.id === display || category.name === display,
    )?.id ?? display
  );
}

function resolveBookAccountId(line: EntryLine): string {
  if (line.bookAccountId != null && line.bookAccountId.length > 0) {
    return line.bookAccountId;
  }
  return (
    DEFAULT_BOOK_ACCOUNTS.find(
      (account) =>
        account.name === line.accountName &&
        account.accountType === line.accountType,
    )?.id ??
    DEFAULT_BOOK_ACCOUNTS.find((account) => account.name === line.accountName)
      ?.id ??
    line.accountName
  );
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
