import { fiscalPeriodPhaseLabel } from "@rubydogjp/openkk-client-domain";
import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-client-ports";

import { CliUsageError, type CliOutput } from "./cli-io.js";

export type PeriodsCommandInput = {
  api: OpenkkBackendPort;
  output: CliOutput;
  args: string[];
  options: {
    name: string | null;
    start: string | null;
    end: string | null;
    json: boolean;
  };
};

export async function runPeriodsCommand(
  input: PeriodsCommandInput,
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
      const period = await requirePeriod(api, rest[0] ?? null);
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
      const period = await requirePeriod(api, rest[0] ?? null);
      const started = await api.fiscalPeriods.start(period.id);
      if (options.json) {
        output.json(started);
        return;
      }
      output.line(`開始しました: ${formatPeriodRow(started)}`);
      return;
    }
    default:
      throw new CliUsageError(
        subcommand == null
          ? "periods のあとに list / show / create / start を指定してください"
          : `periods ${subcommand} というコマンドはありません`,
      );
  }
}

async function requirePeriod(
  api: OpenkkBackendPort,
  id: string | null,
): Promise<FiscalPeriodApiRecord> {
  if (id == null || id === "") {
    throw new CliUsageError("会計期間の ID を指定してください");
  }
  const period = (await api.fiscalPeriods.getAll()).find(
    (candidate) => candidate.id === id,
  );
  if (period == null) {
    throw new CliUsageError(`会計期間 ${id} はありません`);
  }
  return period;
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
