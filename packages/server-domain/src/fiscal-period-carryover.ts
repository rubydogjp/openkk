import { serverConflictError, serverValidationError } from "./app-error.js";
import { getDefaultBookAccount } from "./master-data.js";
import type {
  Entry,
  EntryLine,
  EntryLineRecord,
  EntryRecord,
  FiscalPeriodArchiveStatus,
  FiscalPeriodPhase,
  OpeningBalanceLine,
  OpeningJournal,
} from "./models.js";
import { assertEntryLinesBalanced } from "./validation.js";

export function assertFiscalPeriodCanCarryOver(
  source: {
    endDate: string;
    phase: FiscalPeriodPhase;
    documentsReceivedCompleted: boolean;
    archiveStatus: FiscalPeriodArchiveStatus;
  },
  nextStartDate: string,
): void {
  if (source.phase !== "post_closing" || !source.documentsReceivedCompleted) {
    throw serverConflictError(
      "Carryover requires closing and document receipt completion",
      "本締めと書類の受領を完了してから次の期間を作成してください",
    );
  }
  if (source.archiveStatus === "purged") {
    throw serverConflictError(
      "Cannot carry over a fiscal period whose data was purged",
      "この会計期間の実データは削除済みです",
    );
  }
  if (nextStartDate <= source.endDate) {
    throw serverValidationError(
      "Next fiscal period must start after the source period ends",
      "次の期間の開始日は引き継ぎ元の終了日より後にしてください",
    );
  }
}

export function buildCarryoverOpeningBalances(input: {
  openingBalanceLines: ReadonlyArray<OpeningBalanceLine>;
  entries: ReadonlyArray<Entry>;
}): OpeningBalanceLine[] {
  const balances = new Map<string, bigint>();
  const add = (name: string, amount: bigint) => {
    const account = CAPITAL_ACCOUNTS.has(name) ? "元入金" : name;
    balances.set(account, (balances.get(account) ?? 0n) + amount);
  };
  for (const line of input.openingBalanceLines) {
    add(
      line.accountId.slice(2),
      BigInt(line.amount) * (line.accountId.startsWith("a:") ? 1n : -1n),
    );
  }
  for (const entry of input.entries) {
    assertEntryLinesBalanced(entry.lines, "Carryover entry", {
      allowZero: false,
    });
    for (const line of entry.lines) {
      const account = requireAccount(line.bookAccountId);
      add(
        PROFIT_LOSS_TYPES.has(account.accountType) ? "元入金" : account.name,
        BigInt(line.amount) * (line.side === "debit" ? 1n : -1n),
      );
    }
  }
  return [...balances].flatMap(([name, balance]) => {
    if (balance === 0n) return [];
    const amount = Number(balance < 0n ? -balance : balance);
    if (!Number.isSafeInteger(amount)) {
      throw serverValidationError(
        "Carryover balance exceeds the safe integer range",
        null,
      );
    }
    const accountId =
      name === "元入金" && balance > 0n
        ? "a:事業主貸"
        : `${balance > 0n ? "a" : "l"}:${name}`;
    return [{ id: accountId, accountId, amount }];
  });
}

export function buildCarryoverOpeningJournals(input: {
  entries: ReadonlyArray<EntryRecord>;
  startDate: string;
}): OpeningJournal[] {
  return input.entries.flatMap((entry) => {
    assertEntryLinesBalanced(entry.lines, "Carryover entry", {
      allowZero: false,
    });
    const balances = entry.lines
      .filter((line) => {
        const account = requireAccount(line.bookAccountId);
        return (
          (account.accountType === "asset" ||
            account.accountType === "liability") &&
          REVERSIBLE_BALANCE_ACCOUNTS.has(account.name)
        );
      })
      .map((line) => ({ line, remaining: line.amount }));
    const profitLoss = entry.lines
      .filter((line) =>
        PROFIT_LOSS_TYPES.has(requireAccount(line.bookAccountId).accountType),
      )
      .map((line) => ({ line, remaining: line.amount }));
    const journals: OpeningJournal[] = [];
    for (const balance of balances) {
      for (const counterpart of profitLoss) {
        if (balance.remaining === 0) break;
        if (
          counterpart.remaining === 0 ||
          counterpart.line.side === balance.line.side
        )
          continue;
        const amount = Math.min(balance.remaining, counterpart.remaining);
        const id = `oc-${entry.id}-${journals.length + 1}`;
        journals.push({
          id,
          date: input.startDate,
          description: `再振替: ${entry.description}`,
          businessRate: entry.businessRate,
          lines: [
            reverseLine(`${id}-b`, balance.line, amount),
            reverseLine(`${id}-p`, counterpart.line, amount),
          ],
        });
        balance.remaining -= amount;
        counterpart.remaining -= amount;
      }
    }
    if (journals.length === 0) {
      throw serverValidationError(
        `Entry ${entry.id} has no reversible balance`,
        "選択した仕訳に再振替できる明細がありません",
      );
    }
    return journals;
  });
}

function reverseLine(
  id: string,
  line: EntryLine,
  amount: number,
): EntryLineRecord {
  return {
    id,
    side: line.side === "debit" ? ("credit" as const) : ("debit" as const),
    bookAccountId: line.bookAccountId,
    amount,
    partnerName: line.partnerName,
    taxCategoryId: line.taxCategoryId,
    businessCategoryId: line.businessCategoryId,
  };
}

function requireAccount(id: string) {
  const account = getDefaultBookAccount(id);
  if (account == null) {
    throw serverValidationError(`Unknown carryover book account: ${id}`, null);
  }
  return account;
}

const CAPITAL_ACCOUNTS = new Set([
  "事業主貸",
  "事業主借",
  "元入金",
  "青色申告特別控除前の所得金額",
]);
const PROFIT_LOSS_TYPES = new Set(["revenue", "expense", "cost_of_sales"]);
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
