import {
  assertLegacyArchiveZipByteLength,
  fiscalPeriodPhaseLabel,
  readLegacyArchiveZip,
} from "@rubydogjp/openkk-driver";

import { CliUsageError } from "../cli-output.js";
import type { CliCommandContext } from "../command-context.js";

export async function runLegacyArchiveCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, target] = context.args;
  const { backend, output, options } = context;
  switch (subcommand) {
    case "import": {
      if (target == null) {
        throw new CliUsageError("取り込む zip ファイルを指定してください");
      }
      const bytes = context.files.readBytes(context.files.resolve(target));
      assertLegacyArchiveZipByteLength(bytes.byteLength);
      const imported = await backend.fiscalPeriods.importArchived(
        readLegacyArchiveZip(bytes),
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
          ? "archive のあとに import を指定してください"
          : `archive ${subcommand} というコマンドはありません`,
      );
  }
}
