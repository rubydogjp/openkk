import {
  buildFiscalPeriodBookFilename,
  buildNextFiscalPeriodSuggestion,
  fiscalPeriodPhaseLabel,
  isReadyForCarryover,
  carryOverFromBackend,
  copyFiscalPeriodToBackend,
} from "@rubydogjp/openkk-driver";
import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-driver";

import { CliUsageError } from "../cli-output.js";
import {
  createNewBook,
  requireFiscalPeriod,
  type CliCommandContext,
} from "../command-context.js";

export async function runPeriodsCommand(
  input: CliCommandContext,
): Promise<void> {
  const [subcommand, ...rest] = input.args;
  const { backend, output, options } = input;
  switch (subcommand) {
    case "list": {
      const periods = await backend.fiscalPeriods.getAll();
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
      const period = await requireFiscalPeriod(backend, rest[0] ?? null);
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
      const created = await backend.fiscalPeriods.create({
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
      const period = await requireFiscalPeriod(backend, rest[0] ?? null);
      const started = await backend.fiscalPeriods.start(period.id);
      if (options.json) {
        output.json(started);
        return;
      }
      output.line(`開始しました: ${formatPeriodRow(started)}`);
      return;
    }
    case "receive": {
      const period = await requireFiscalPeriod(backend, rest[0] ?? null);
      const updated = await backend.fiscalPeriods.patch(period.id, {
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
      const source = await requireFiscalPeriod(backend, rest[0] ?? null);
      const suggestion = buildNextFiscalPeriodSuggestion(source.endDate);
      if (options.out != null) {
        const bookPath = input.files.resolve(options.out);
        const book = await createNewBook(input, bookPath);
        try {
          const created = await book.backend.fiscalPeriods.create({
            name: options.name ?? suggestion.name,
            startDate: options.start ?? suggestion.startDate,
            endDate: options.end ?? suggestion.endDate,
          });
          const carriedOver = isReadyForCarryover(source);
          const period = carriedOver
            ? await carryOverFromBackend(
                backend,
                source,
                book.backend,
                created.id,
                input.today(),
              )
            : created;
          if (options.json) {
            output.json({ file: bookPath, fiscalPeriod: period, carriedOver });
            return;
          }
          output.line(
            `次の期間のファイルを作りました: ${bookPath}  ${formatPeriodRow(period)}`,
          );
          output.line(
            carriedOver
              ? "期首のBSと固定資産を引き継ぎました"
              : `${source.name} はまだ本締めと書類の受け取りを終えていないので、引き継いでいません。終えたら openkk --file ${bookPath} opening carry ${period.id} --from ${input.bookPath} で引き継げます`,
          );
        } finally {
          book.close();
        }
        return;
      }
      const created = await backend.fiscalPeriods.createNext({
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
      const period = await requireFiscalPeriod(backend, rest[0] ?? null);
      const bookPath = input.files.resolve(
        options.out ?? buildFiscalPeriodBookFilename(period),
      );
      const book = await createNewBook(input, bookPath);
      try {
        const copied = await copyFiscalPeriodToBackend(
          backend,
          period,
          book.backend,
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
