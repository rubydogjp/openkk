import { formatAmount } from "@rubydogjp/openkk-driver";
import type {
  FiscalPeriodApiRecord,
  OpeningBalanceLineApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
} from "./command-context.js";
import { carryOverFromBook } from "./period-transfer.js";
import { loadMaster, requireAccountByExactName } from "./records.js";

const ASSET_PREFIX = "a:";
const LIABILITY_AND_EQUITY_PREFIX = "l:";
const BALANCE_ARGUMENT = /^(.+)=([1-9]\d{0,2}(?:,?\d{3})*)$/;

export async function runOpeningCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, periodId, ...balances] = context.args;
  const { api, output, options } = context;
  switch (subcommand) {
    case "show": {
      const period = await requireFiscalPeriod(api, periodId ?? null);
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
        output.line(
          `${line.accountId.startsWith(ASSET_PREFIX) ? "資産" : "負債・純資産"}  ${line.accountId.slice(2)}  ${formatAmount(line.amount)}`,
        );
      }
      return;
    }
    case "set": {
      const period = await requireFiscalPeriod(api, periodId ?? null);
      const master = await loadMaster(api);
      const lines = balances.map((argument) =>
        parseBalanceArgument(argument, master.accounts),
      );
      assertUniqueAccounts(lines);
      const assetTotal = sumLines(lines, ASSET_PREFIX);
      const liabilityTotal = sumLines(lines, LIABILITY_AND_EQUITY_PREFIX);
      if (assetTotal !== liabilityTotal) {
        throw new CliUsageError(
          `資産合計 (${formatAmount(assetTotal)}) と負債・純資産合計 (${formatAmount(liabilityTotal)}) を一致させてください`,
        );
      }
      const updated = await api.fiscalPeriods.patch(period.id, {
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
      const target = await requireFiscalPeriod(api, periodId ?? null);
      if (options.from == null) {
        throw new CliUsageError(
          "引き継ぎ元の帳簿ファイルを --from で指定してください",
        );
      }
      const sourceBook = await context.openBook(
        context.resolvePath(options.from),
      );
      try {
        const source = await requireCarryoverSource(
          sourceBook.api,
          options.fromPeriod,
        );
        const updated = await carryOverFromBook(
          sourceBook.api,
          source,
          api,
          target.id,
          context.today(),
        );
        if (options.json) {
          output.json(updated);
          return;
        }
        output.line(`引き継ぎました: ${source.name} → ${updated.name}`);
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

function parseBalanceArgument(
  argument: string,
  accounts: ReadonlyArray<{ id: string; name: string; accountType: string }>,
): OpeningBalanceLineApiRecord {
  const match = BALANCE_ARGUMENT.exec(argument);
  if (match == null) {
    throw new CliUsageError(
      `期首の残高は 科目=金額 の形で指定してください: ${argument}`,
    );
  }
  const [, accountName, amount] = match;
  const account = requireAccountByExactName(accountName!, accounts);
  const prefix =
    account.accountType === "asset"
      ? ASSET_PREFIX
      : account.accountType === "liability" || account.accountType === "equity"
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

function sumLines(
  lines: ReadonlyArray<OpeningBalanceLineApiRecord>,
  prefix: string,
): number {
  return lines
    .filter((line) => line.accountId.startsWith(prefix))
    .reduce((total, line) => total + line.amount, 0);
}

async function requireCarryoverSource(
  api: OpenkkBackendPort,
  periodId: string | null,
): Promise<FiscalPeriodApiRecord> {
  if (periodId != null) return requireFiscalPeriod(api, periodId);
  const periods = await api.fiscalPeriods.getAll();
  const [onlyPeriod] = periods;
  if (periods.length !== 1 || onlyPeriod == null) {
    throw new CliUsageError(
      `引き継ぎ元の帳簿に会計期間が ${periods.length} つあります。--from-period で選んでください`,
    );
  }
  return onlyPeriod;
}
