import {
  AppError,
  applyJournalTableChanges,
  formatJournalExport,
  hasJournalTableChanges,
  importEntryRecords,
  isMaterializedVirtualEntry,
  JOURNAL_FILE_KINDS,
  loadEntryRecords,
  loadJournalMaster,
  planJournalImport,
  storedEntryToRecord,
  type EntryLineMaster,
  type EntryRecord,
  type FiscalPeriodApiRecord,
  type JournalFileKind,
  type JournalTableChanges,
  type JournalTableProblem,
} from "@rubydogjp/openkk-driver";

import { CliUsageError, type CliOutput } from "../cli-output.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
  type CliOptions,
} from "../command-context.js";
import { requireAccountByExactName } from "./records.js";

const FULL_BUSINESS_RATE_PERCENT = 100;
const AMOUNT_PATTERN = /^[1-9]\d{0,2}(?:,?\d{3})*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NO_AUTH_CHECK = () => {};

export async function runEntriesCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, periodId, ...rest] = context.args;
  const { backend, output, options } = context;
  switch (subcommand) {
    case "list": {
      const period = await requireFiscalPeriod(backend, periodId ?? null);
      const records = await loadEntryRecords(
        backend,
        period.id,
        await loadJournalMaster(backend),
      );
      if (options.json) {
        output.json(records);
        return;
      }
      if (records.length === 0) {
        output.line("仕訳はまだありません");
        return;
      }
      for (const record of records) output.line(formatEntryRow(record));
      return;
    }
    case "add": {
      const period = await requireFiscalPeriod(backend, periodId ?? null);
      const master = await loadJournalMaster(backend);
      const created = await backend.entries.create(
        period.id,
        buildSinglePairInput(options, master),
      );
      const record = storedEntryToRecord(created, period.id, master);
      if (options.json) {
        output.json(record);
        return;
      }
      output.line(`追加しました: ${formatEntryRow(record)}`);
      return;
    }
    case "import": {
      const period = await requireFiscalPeriod(backend, periodId ?? null);
      const file = rest[0];
      if (file == null) {
        throw new CliUsageError("取り込むファイルを指定してください");
      }
      const filePath = context.files.resolve(file);
      const fileKind = requireJournalFileKind(
        options.format ?? fileExtension(filePath),
      );
      const master = await loadJournalMaster(backend);
      const plan = planJournalImport({
        fileKind,
        bytes: context.files.readBytes(filePath),
        fiscalPeriod: period,
        currentEntries: await loadEntryRecords(backend, period.id, master),
        master,
      });
      if (plan.kind === "problems") throw unreadableRowsError(plan.problems);
      if (plan.kind === "replace") {
        await replaceEntries(context, period, plan.changes, master);
        return;
      }
      const result = await importEntryRecords(
        backend,
        period.id,
        plan.entries,
        master,
      );
      if (options.json) {
        output.json({ imported: result.imported, skipped: result.skipped });
        return;
      }
      output.line(
        `${plan.fromLegacyCsv ? "以前の形式の CSV なので、足すだけで" : ""}取り込みました (取込 ${result.imported} 件 / 重複スキップ ${result.skipped} 件)`,
      );
      return;
    }
    case "export": {
      const period = await requireFiscalPeriod(backend, periodId ?? null);
      const fileKind = requireJournalFileKind(options.format ?? "csv");
      const master = await loadJournalMaster(backend);
      const entries = await loadEntryRecords(backend, period.id, master);
      const exported = formatJournalExport(fileKind, entries, master);
      const data = fileKind === "json" ? `${exported}\n` : exported;
      if (options.out == null) {
        output.raw(data);
        return;
      }
      const outPath = context.files.resolve(options.out);
      context.files.writeText(outPath, data);
      const exportedCount = entries.filter(
        (entry) => !isMaterializedVirtualEntry(entry),
      ).length;
      output.line(`書き出しました: ${outPath} (${exportedCount} 件)`);
      return;
    }
    default:
      throw new CliUsageError(
        subcommand == null
          ? "entries のあとに list / add / import / export を指定してください"
          : `entries ${subcommand} というコマンドはありません`,
      );
  }
}

function buildSinglePairInput(options: CliOptions, master: EntryLineMaster) {
  const { date, debit, credit, amount, description } = options;
  if (
    date == null ||
    debit == null ||
    credit == null ||
    amount == null ||
    description == null ||
    description.trim() === ""
  ) {
    throw new CliUsageError(
      "entries add には --date と --debit と --credit と --amount と --description が要ります",
    );
  }
  if (!DATE_PATTERN.test(date)) {
    throw new CliUsageError("--date は YYYY-MM-DD で指定してください");
  }
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new CliUsageError("--amount は 1 以上の整数で指定してください");
  }
  const value = Number(amount.replaceAll(",", ""));
  const line = (side: "debit" | "credit", accountName: string) => ({
    side,
    bookAccountId: requireAccountByExactName(accountName, master.accounts).id,
    amount: value,
    partnerName: "",
    taxCategoryId: "tax_out_of_scope",
    businessCategoryId: "biz_none",
  });
  return {
    date,
    description,
    localId: null,
    businessRate: parseBusinessRatePercent(options.businessRate),
    lines: [line("debit", debit), line("credit", credit)],
  };
}

function parseBusinessRatePercent(input: string | null): number {
  if (input == null) return 1;
  const percent = Number(input);
  if (
    input.trim() === "" ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > FULL_BUSINESS_RATE_PERCENT
  ) {
    throw new CliUsageError("--business-rate は 0〜100 で指定してください");
  }
  return percent / FULL_BUSINESS_RATE_PERCENT;
}

function requireJournalFileKind(format: string): JournalFileKind {
  const normalized = format.toLowerCase();
  const fileKind = JOURNAL_FILE_KINDS.find((kind) => kind === normalized);
  if (fileKind == null) {
    throw new CliUsageError(
      "ファイル形式は csv か json です (--format で指定できます)",
    );
  }
  return fileKind;
}

function fileExtension(filePath: string): string {
  const fileName = filePath.slice(
    Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1,
  );
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? "" : fileName.slice(dot + 1);
}

function unreadableRowsError(
  problems: ReadonlyArray<JournalTableProblem>,
): AppError {
  return new AppError({
    messageForDeveloper: "cli: journal CSV has rows that cannot be read",
    messageForUser: [
      "取り込めない行があります。CSV を直してから、もう一度取り込んでください。",
      ...problems.map(
        (problem) => `  ${problem.rowNumber} 行目: ${problem.message}`,
      ),
    ].join("\n"),
    originalMessage: null,
    statusCode: null,
    code: null,
  });
}

async function replaceEntries(
  context: CliCommandContext,
  period: FiscalPeriodApiRecord,
  changes: JournalTableChanges,
  master: EntryLineMaster,
): Promise<void> {
  const { backend, output, options } = context;
  const hasChanges = hasJournalTableChanges(changes);
  if (hasChanges && !options.yes) {
    throw new CliUsageError(
      `CSV で仕訳を置き換えます (${describeChanges(changes)})。ファイルにない仕訳は消えます。反映するときは --yes を付けてください`,
    );
  }
  if (hasChanges) {
    await applyJournalTableChanges(
      backend,
      period.id,
      changes,
      master,
      NO_AUTH_CHECK,
    );
  }
  if (options.json) {
    output.json({
      added: changes.added.length,
      changed: changes.changed.length,
      removed: changes.removed.length,
      unchanged: changes.unchangedCount,
    });
    return;
  }
  reportChanges(output, hasChanges, changes);
}

function reportChanges(
  output: CliOutput,
  hasChanges: boolean,
  changes: JournalTableChanges,
): void {
  output.line(
    hasChanges
      ? `置き換えました (${describeChanges(changes)})`
      : "CSV は今の仕訳と同じです",
  );
}

function describeChanges(changes: JournalTableChanges): string {
  return `追加 ${changes.added.length} 件 / 変更 ${changes.changed.length} 件 / 削除 ${changes.removed.length} 件 / そのまま ${changes.unchangedCount} 件`;
}

function formatEntryRow(record: EntryRecord): string {
  const lines = record.lines
    .map(
      (line) =>
        `${line.side === "debit" ? "借" : "貸"} ${line.accountName} ${line.amount}`,
    )
    .join(" / ");
  return [record.date, lines, record.description].join("  ");
}
