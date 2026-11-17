import {
  CAPITAL_ACCOUNT_NAME,
  fixedAssetsReplacedByCarryover,
  formatAmount,
  formatSignedAmountText,
  isNegativeCapitalLine,
  NEGATIVE_CAPITAL_ACCOUNT_ID,
  openingSideTotals,
  loadJournalMaster,
  loadFiscalPeriodArchivePayload,
} from "@rubydogjp/openkk-driver";
import type {
  FiscalPeriodApiRecord,
  MasterBookAccountApiRecord,
  OpeningBalanceLineApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-driver";

import { CliUsageError, cliRefusal } from "../cli-output.js";
import {
  openExistingBook,
  requireFiscalPeriod,
  type CliCommandContext,
} from "../command-context.js";
import { requireAccountByExactName } from "./records.js";

const ASSET_PREFIX = "a:";
const LIABILITY_AND_EQUITY_PREFIX = "l:";
const BALANCE_ARGUMENT = /^(.+)=([-△]?)([1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/;
const CARRY_ITEM_BALANCES = "bs";
const CARRY_ITEM_FIXED_ASSETS = "fixed-assets";
const CARRY_ITEMS = new Set([CARRY_ITEM_BALANCES, CARRY_ITEM_FIXED_ASSETS]);
const NO_AUTH_CHECK = () => {};

type CarryItems = { balances: boolean; fixedAssets: boolean };

export async function runOpeningCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, periodId, ...balances] = context.args;
  const { backend, output, options } = context;
  switch (subcommand) {
    case "show": {
      const period = await requireFiscalPeriod(backend, periodId ?? null);
      if (options.json) {
        output.json(period.opening.balanceLines);
        return;
      }
      if (period.opening.balanceLines.length === 0) {
        output.line(
          period.openingBalancesCompleted
            ? "期首のBSは空で保存されています"
            : "期首のBSはまだ入力されていません",
        );
        return;
      }
      for (const line of period.opening.balanceLines) {
        const negativeCapital = isNegativeCapitalLine(line);
        output.line(
          `${line.accountId.startsWith(ASSET_PREFIX) && !negativeCapital ? "資産" : "負債・純資産"}  ${line.accountId.slice(2)}  ${formatSignedAmountText(negativeCapital ? -line.amount : line.amount)}`,
        );
      }
      return;
    }
    case "set": {
      const period = await requireFiscalPeriod(backend, periodId ?? null);
      if (balances.length === 0) {
        throw new CliUsageError(
          "期首の残高を 1 つ以上、科目=金額 の形で指定してください",
        );
      }
      const { accounts } = await loadJournalMaster(backend, period.masterSetId);
      const lines = balances.map((argument) =>
        parseBalanceArgument(argument, accounts),
      );
      assertUniqueAccounts(lines);
      const totals = openingSideTotals(lines);
      const assetTotal = totals.assets;
      const liabilityTotal = totals.liabilitiesAndEquity;
      if (assetTotal !== liabilityTotal) {
        throw cliRefusal(
          `資産合計 (${formatAmount(assetTotal)}) と負債・純資産合計 (${formatAmount(liabilityTotal)}) を一致させてください`,
        );
      }
      const updated = await backend.fiscalPeriods.patch(period.id, {
        openingBalancesCompleted: true,
        opening: { balanceLines: lines, journals: period.opening.journals },
      });
      if (options.json) {
        output.json(updated.opening.balanceLines);
        return;
      }
      output.line(
        `期首のBSを保存しました (資産合計 ${formatAmount(assetTotal)})`,
      );
      return;
    }
    case "carry": {
      const target = await requireFiscalPeriod(backend, periodId ?? null);
      const items = parseCarryItems(options.items);
      if (options.from == null) {
        throw new CliUsageError(
          "引き継ぎ元の帳簿ファイルを --from で指定してください",
        );
      }
      const sourceBook = await openExistingBook(
        context,
        context.files.resolve(options.from),
      );
      try {
        const source = await requireCarryoverSource(
          sourceBook.backend,
          options.fromPeriod,
        );
        const replaced = await describeReplacedItems(backend, target, items);
        if (replaced.length > 0 && !options.yes) {
          throw cliRefusal(
            `引き継ぐと今の${replaced.join("と")}が置き換わります。置き換えるときは --yes を付けてください`,
          );
        }
        const updated = await backend.fiscalPeriods.applyCarryoverFromArchive(
          target.id,
          {
            archive: await loadFiscalPeriodArchivePayload(
              sourceBook.backend,
              source,
              context.today(),
              NO_AUTH_CHECK,
            ),
            carryBalances: items.balances,
            reversalEntryIndexes: null,
            carryFixedAssets: items.fixedAssets,
          },
        );
        if (options.json) {
          output.json(updated);
          return;
        }
        output.line(
          `引き継ぎました: ${source.name} → ${updated.name} (${carriedItemLabels(items).join("・")})`,
        );
      } finally {
        sourceBook.close();
      }
      return;
    }
    default:
      throw new CliUsageError(
        subcommand == null
          ? "opening のあとに show / set / carry を指定してください"
          : `opening ${subcommand} というコマンドはありません`,
      );
  }
}

function parseCarryItems(input: string | null): CarryItems {
  if (input == null) return { balances: true, fixedAssets: false };
  const names = input.split(",").map((name) => name.trim());
  const unknown = names.filter((name) => !CARRY_ITEMS.has(name));
  if (names.length === 0 || unknown.length > 0) {
    throw new CliUsageError(
      `--items には ${[...CARRY_ITEMS].join(" / ")} をカンマ区切りで指定してください: ${input}`,
    );
  }
  return {
    balances: names.includes(CARRY_ITEM_BALANCES),
    fixedAssets: names.includes(CARRY_ITEM_FIXED_ASSETS),
  };
}

function carriedItemLabels(items: CarryItems): string[] {
  return [
    ...(items.balances ? ["期首のBS"] : []),
    ...(items.fixedAssets ? ["固定資産"] : []),
  ];
}

async function describeReplacedItems(
  backend: OpenkkBackendPort,
  target: FiscalPeriodApiRecord,
  items: CarryItems,
): Promise<string[]> {
  const balanceLineCount = target.opening.balanceLines.length;
  const fixedAssetCount = items.fixedAssets
    ? fixedAssetsReplacedByCarryover(
        await backend.fixedAssets.getAll(target.id),
        target,
      ).length
    : 0;
  return [
    ...(items.balances && balanceLineCount > 0
      ? [`期首のBS ${balanceLineCount} 行`]
      : []),
    ...(fixedAssetCount > 0 ? [`固定資産 ${fixedAssetCount} 件`] : []),
  ];
}

function parseBalanceArgument(
  argument: string,
  accounts: ReadonlyArray<MasterBookAccountApiRecord>,
): OpeningBalanceLineApiRecord {
  const match = BALANCE_ARGUMENT.exec(argument);
  if (match == null) {
    throw new CliUsageError(
      `期首の残高は 科目=金額 の形で指定してください: ${argument}`,
    );
  }
  const [, accountName, sign, amount] = match;
  const account = requireAccountByExactName(accountName!, accounts);
  if (sign !== "") {
    if (account.name !== CAPITAL_ACCOUNT_NAME) {
      throw new CliUsageError(
        `マイナスの金額を書けるのは元入金だけです: ${argument}`,
      );
    }
    return {
      id: NEGATIVE_CAPITAL_ACCOUNT_ID,
      accountId: NEGATIVE_CAPITAL_ACCOUNT_ID,
      amount: Number(amount!.replaceAll(",", "")),
    };
  }
  const prefix =
    account.accountType === "asset" && account.normalBalanceSide === "debit"
      ? ASSET_PREFIX
      : account.accountType === "asset" ||
          account.accountType === "liability" ||
          account.accountType === "equity"
        ? LIABILITY_AND_EQUITY_PREFIX
        : null;
  if (prefix == null) {
    throw new CliUsageError(
      `「${account.name}」は資産・負債・純資産の科目ではありません`,
    );
  }
  const accountId = `${prefix}${account.name}`;
  return {
    id: accountId,
    accountId,
    amount: Number(amount!.replaceAll(",", "")),
  };
}

function assertUniqueAccounts(
  lines: ReadonlyArray<OpeningBalanceLineApiRecord>,
): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.accountId)) {
      throw new CliUsageError(
        `同じ科目が 2 回指定されています: ${line.accountId.slice(2)}`,
      );
    }
    seen.add(line.accountId);
  }
}

async function requireCarryoverSource(
  backend: OpenkkBackendPort,
  periodId: string | null,
): Promise<FiscalPeriodApiRecord> {
  if (periodId != null) return requireFiscalPeriod(backend, periodId);
  const periods = await backend.fiscalPeriods.getAll();
  const [onlyPeriod] = periods;
  if (periods.length !== 1 || onlyPeriod == null) {
    throw new CliUsageError(
      `引き継ぎ元の帳簿に会計期間が ${periods.length} つあります。--from-period で選んでください`,
    );
  }
  return onlyPeriod;
}
