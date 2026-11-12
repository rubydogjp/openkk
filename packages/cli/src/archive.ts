import fs from "node:fs";
import {
  assertFiscalPeriodArchiveByteLength,
  buildFiscalPeriodArchiveFilename,
  fiscalPeriodPhaseLabel,
  readFiscalPeriodArchiveZip,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
} from "./command-context.js";
import { buildFiscalPeriodArchiveZipFromBook } from "./period-transfer.js";

export async function runArchiveCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, target] = context.args;
  const { api, output, options } = context;
  switch (subcommand) {
    case "export": {
      const period = await requireFiscalPeriod(api, target ?? null);
      const zip = await buildFiscalPeriodArchiveZipFromBook(
        api,
        period,
        context.today(),
      );
      const outPath = context.resolvePath(
        options.out ?? buildFiscalPeriodArchiveFilename(period),
      );
      fs.writeFileSync(outPath, zip);
      output.line(`書き出しました: ${outPath}`);
      return;
    }
    case "import": {
      if (target == null) {
        throw new CliUsageError("取り込む zip ファイルを指定してください");
      }
      const bytes = new Uint8Array(
        fs.readFileSync(context.resolvePath(target)),
      );
      assertFiscalPeriodArchiveByteLength(bytes.byteLength);
      const imported = await api.fiscalPeriods.importArchived(
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
