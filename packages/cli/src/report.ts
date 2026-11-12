import fs from "node:fs";
import {
  buildFiscalPeriodReport,
  FISCAL_PERIOD_REPORT_LABELS,
  type FiscalPeriodReportKind,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
} from "./command-context.js";
import { loadFiscalPeriodReportInput } from "./records.js";

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
  const period = await requireFiscalPeriod(context.api, periodId ?? null);
  const html = buildFiscalPeriodReport(
    kind,
    await loadFiscalPeriodReportInput(context.api, period, context.today()),
  );
  if (context.options.out == null) {
    context.output.raw(html);
    return;
  }
  const outPath = context.resolvePath(context.options.out);
  fs.writeFileSync(outPath, html);
  context.output.line(
    `${FISCAL_PERIOD_REPORT_LABELS[kind].name}を書き出しました: ${outPath}`,
  );
}
