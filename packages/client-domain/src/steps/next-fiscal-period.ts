import { DEFAULT_BOOK_ACCOUNTS } from "../entries/default-master-data";
import { getEntryLines, type EntryLine, type EntryRecord } from "../entries/entry-record";
import { parseAmount, parseBusinessRate } from "../shared/parse-utils";

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
    taxCategoryName: string;
    businessCategoryName: string;
  }>;
};

const REVERSIBLE_BALANCE_ACCOUNTS = new Set([
  "売掛金",
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
    const balanceLines = lines.filter(isReversibleBalanceLine);
    const profitLossLines = lines.filter((line) =>
      PROFIT_LOSS_TYPES.has(line.accountType),
    );

    for (const pair of matchReversiblePairs(balanceLines, profitLossLines)) {
      const journalId = `oc-${input.nextFiscalPeriodId}-${entry.id}-${journals.length + 1}`;
      const reversedBalanceLine = reverseLine(pair.balanceLine, pair.amount);
      const reversedProfitLossLine = reverseLine(pair.profitLossLine, pair.amount);
      journals.push({
        id: journalId,
        date: input.nextStartDate,
        description: `再振替: ${entry.description}`,
        businessRate: parseBusinessRate(entry.businessRate),
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

function matchReversiblePairs(
  balanceLines: EntryLine[],
  profitLossLines: EntryLine[],
): Array<{ balanceLine: EntryLine; profitLossLine: EntryLine; amount: number }> {
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

  if (
    remainingBalanceLines.some((item) => item.remaining > 0) ||
    remainingProfitLossLines.some((item) => item.remaining > 0)
  ) {
    return [];
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
    partnerName: entry.partner,
    taxCategoryName: entry.taxCategory,
    businessCategoryName: entry.businessCategory,
  };
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
    DEFAULT_BOOK_ACCOUNTS.find((account) => account.name === line.accountName)?.id ??
    line.accountName
  );
}
