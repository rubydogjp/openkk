import {
  buildFinalClosingEntries,
  entryRecordToImportPayload,
  fiscalPeriodPhaseLabel,
  isCurrentMonthWithinFiscalPeriod,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
} from "./command-context.js";
import { loadFiscalPeriodReportInput, loadMaster } from "./records.js";

const CLOSING_SUBCOMMANDS = new Set(["pre", "cancel", "final"]);

export async function runClosingCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, periodId] = context.args;
  const { api, output, options } = context;
  if (subcommand == null || !CLOSING_SUBCOMMANDS.has(subcommand)) {
    throw new CliUsageError(
      subcommand == null
        ? "closing のあとに pre / cancel / final を指定してください"
        : `closing ${subcommand} というコマンドはありません`,
    );
  }
  const period = await requireFiscalPeriod(api, periodId ?? null);
  const report = (label: string, phase: typeof period.phase) =>
    output.line(`${label}: ${period.name} (${fiscalPeriodPhaseLabel(phase)})`);
  switch (subcommand) {
    case "pre": {
      if (
        !options.yes &&
        isCurrentMonthWithinFiscalPeriod(
          period.startDate,
          period.endDate,
          context.today(),
        )
      ) {
        throw new CliUsageError(
          "まだ期中です。通常は翌2月ごろに実行します。このまま仮締めするときは --yes を付けてください",
        );
      }
      const updated = await api.preClosings.run(period.id);
      report("仮締めしました", updated.phase);
      return;
    }
    case "cancel": {
      const updated = await api.preClosings.cancel(period.id);
      report("仮締めを取り消しました", updated.phase);
      return;
    }
    case "final": {
      if (!options.yes) {
        throw new CliUsageError(
          "本締めは取り消せません。report で仮の帳票を確かめたうえで、--yes を付けて実行してください",
        );
      }
      const [input, master] = await Promise.all([
        loadFiscalPeriodReportInput(api, period, context.today()),
        loadMaster(api),
      ]);
      const updated = await api.closings.run(
        period.id,
        buildFinalClosingEntries(input).map((entry) =>
          entryRecordToImportPayload(entry, master),
        ),
      );
      report("本締めしました", updated.phase);
      return;
    }
  }
}
