import {
  assertFiscalPeriodArchiveByteLength,
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchiveZip,
  fiscalPeriodPhaseLabel,
  readFiscalPeriodArchiveZip,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "../cli-output.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
} from "../command-context.js";

const NO_AUTH_CHECK = () => {};

export async function runArchiveCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, target] = context.args;
  const { backend, output, options } = context;
  switch (subcommand) {
    case "export": {
      const period = await requireFiscalPeriod(backend, target ?? null);
      const zip = await buildFiscalPeriodArchiveZip(
        backend,
        period,
        context.today(),
        NO_AUTH_CHECK,
      );
      const outPath = context.files.resolve(
        options.out ?? buildFiscalPeriodArchiveFilename(period),
      );
      context.files.writeBytes(outPath, zip);
      output.line(`書き出しました: ${outPath}`);
      return;
    }
    case "import": {
      if (target == null) {
        throw new CliUsageError("取り込む zip ファイルを指定してください");
      }
      const bytes = context.files.readBytes(context.files.resolve(target));
      assertFiscalPeriodArchiveByteLength(bytes.byteLength);
      const imported = await backend.fiscalPeriods.importArchived(
        readFiscalPeriodArchiveZip(bytes),
      );
      if (options.json) {
        output.json(imported);
        return;
      }
      output.line(
        `取り込みました: ${imported.id}  ${imported.startDate}..${imported.endDate}  ${fiscalPeriodPhaseLabel(imported.phase)}  ${imported.name}`,
      );
      return;
    }
    default:
      throw new CliUsageError(
        subcommand == null
          ? "archive のあとに export / import を指定してください"
          : `archive ${subcommand} というコマンドはありません`,
      );
  }
}
