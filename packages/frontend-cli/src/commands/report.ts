import {
  buildFiscalPeriodReport,
  FISCAL_PERIOD_REPORT_LABELS,
  loadFiscalPeriodReportInput,
  type FiscalPeriodReportKind,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "../cli-output.js";
import {
  requireFiscalPeriod,
  writeNewTextFile,
  type CliCommandContext,
} from "../command-context.js";

const REPORT_KIND_BY_ARGUMENT = new Map<string, FiscalPeriodReportKind>([
  ["journal", "journal"],
  ["ledger", "generalLedger"],
  ["fs", "financialStatements"],
]);

export async function runReportCommand(
  context: CliCommandContext,
): Promise<void> {
  const [periodId, kindArgument] = context.args;
  const kind = REPORT_KIND_BY_ARGUMENT.get(kindArgument ?? "");
  if (kind == null) {
    throw new CliUsageError(
      "report <期間id> のあとに journal / ledger / fs を指定してください",
    );
  }
  const period = await requireFiscalPeriod(context.backend, periodId ?? null);
  const html = buildFiscalPeriodReport(
    kind,
    await loadFiscalPeriodReportInput(context.backend, period, context.today()),
  );
  if (context.options.out == null) {
    context.output.raw(html);
    return;
  }
  const outPath = context.files.resolve(context.options.out);
  writeNewTextFile(context, outPath, html);
  context.output.line(
    `${FISCAL_PERIOD_REPORT_LABELS[kind].name}を書き出しました: ${outPath}`,
  );
}
