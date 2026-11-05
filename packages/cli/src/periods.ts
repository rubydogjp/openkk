import {
  buildFiscalPeriodBookFilename,
  buildNextFiscalPeriodSuggestion,
  fiscalPeriodPhaseLabel,
} from "@rubydogjp/openkk-client-domain";
import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-client-ports";

import { CliUsageError } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
} from "./command-context.js";
import { copyFiscalPeriodToBook } from "./period-transfer.js";

export async function runPeriodsCommand(
  input: CliCommandContext,
): Promise<void> {
  const [subcommand, ...rest] = input.args;
  const { api, output, options } = input;
  switch (subcommand) {
    case "list": {
      const periods = await api.fiscalPeriods.getAll();
      if (options.json) {
        output.json(periods);
        return;
      }
      if (periods.length === 0) {
        output.line("会計期間はまだありません");
        return;
      }
      for (const period of periods) output.line(formatPeriodRow(period));
      return;
    }
    case "show": {
      const period = await requireFiscalPeriod(api, rest[0] ?? null);
      if (options.json) {
        output.json(period);
        return;
      }
      output.line(formatPeriodDetail(period));
      return;
    }
    case "create": {
      if (
        options.name == null ||
        options.start == null ||
        options.end == null
      ) {
        throw new CliUsageError(
          "periods create には --name と --start と --end が要ります",
        );
      }
      const created = await api.fiscalPeriods.create({
        name: options.name,
        startDate: options.start,
        endDate: options.end,
      });
      if (options.json) {
        output.json(created);
        return;
      }
      output.line(`作成しました: ${formatPeriodRow(created)}`);
      return;
    }
    case "start": {
      const period = await requireFiscalPeriod(api, rest[0] ?? null);
      const started = await api.fiscalPeriods.start(period.id);
      if (options.json) {
        output.json(started);
        return;
      }
      output.line(`開始しました: ${formatPeriodRow(started)}`);
      return;
    }
    case "receive": {
      const period = await requireFiscalPeriod(api, rest[0] ?? null);
      const updated = await api.fiscalPeriods.patch(period.id, {
        documentsReceivedCompleted: true,
      });
      if (options.json) {
        output.json(updated);
        return;
      }
      output.line(`書類を受け取りました: ${formatPeriodRow(updated)}`);
      return;
    }
    case "next": {
      const source = await requireFiscalPeriod(api, rest[0] ?? null);
      const suggestion = buildNextFiscalPeriodSuggestion(source.endDate);
      const created = await api.fiscalPeriods.createNext({
        sourceFiscalPeriodId: source.id,
        name: options.name ?? suggestion.name,
        startDate: options.start ?? suggestion.startDate,
        endDate: options.end ?? suggestion.endDate,
        carryBalances: true,
        reversalEntryIds: [],
        carryFixedAssets: true,
      });
      if (options.json) {
        output.json(created);
        return;
      }
      output.line(`次の期間を作成しました: ${formatPeriodRow(created)}`);
      return;
    }
    case "export": {
      const period = await requireFiscalPeriod(api, rest[0] ?? null);
      const bookPath = input.resolvePath(
        options.out ?? buildFiscalPeriodBookFilename(period),
      );
      const book = await input.createBook(bookPath);
      try {
        const copied = await copyFiscalPeriodToBook(
          api,
          period,
          book.api,
          input.today(),
        );
        if (options.json) {
          output.json({ file: bookPath, fiscalPeriod: copied });
          return;
        }
        output.line(`書き出しました: ${bookPath}  ${formatPeriodRow(copied)}`);
      } finally {
        book.close();
      }
      return;
    }
    default:
      throw new CliUsageError(
        subcommand == null
          ? "periods のあとに list / show / create / start / receive / next / export を指定してください"
          : `periods ${subcommand} というコマンドはありません`,
      );
  }
}

function formatPeriodRow(period: FiscalPeriodApiRecord): string {
  return [
    period.id,
    `${period.startDate}..${period.endDate}`,
    fiscalPeriodPhaseLabel(period.phase),
    period.name,
  ].join("  ");
}

function formatPeriodDetail(period: FiscalPeriodApiRecord): string {
  return [
    `ID: ${period.id}`,
    `名称: ${period.name}`,
    `期間: ${period.startDate}..${period.endDate}`,
    `状態: ${fiscalPeriodPhaseLabel(period.phase)}`,
    `期首のBS: ${period.openingBalancesCompleted ? "入力済み" : "未入力"}`,
    `書類の受け取り: ${period.documentsReceivedCompleted ? "済み" : "まだ"}`,
  ].join("\n");
}
