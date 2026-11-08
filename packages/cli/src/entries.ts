import fs from "node:fs";
import path from "node:path";
import {
  AppError,
  buildJournalTableRows,
  decodeJournalImportBytes,
  diffJournalTableEntries,
  entryRecordToImportPayload,
  exportEntriesAsJson,
  formatJournalTableCsv,
  importEntriesFromJson,
  isMaterializedVirtualEntry,
  journalTableOperations,
  parseJournalTableCsv,
  readJournalTableEntries,
  storedEntryToRecord,
  type EntryLineMaster,
  type EntryRecord,
  type JournalTableChanges,
} from "@rubydogjp/openkk-client-domain";
import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-client-ports";

import { CliUsageError, type CliOutput } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
  type CliOptions,
} from "./command-context.js";
import {
  loadEntryRecords,
  loadMaster,
  requireAccountByExactName,
} from "./records.js";

const ENTRY_FILE_FORMATS = ["csv", "json"] as const;
type EntryFileFormat = (typeof ENTRY_FILE_FORMATS)[number];

const FULL_BUSINESS_RATE_PERCENT = 100;
const AMOUNT_PATTERN = /^[1-9]\d{0,2}(?:,?\d{3})*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function runEntriesCommand(
  context: CliCommandContext,
): Promise<void> {
  const [subcommand, periodId, ...rest] = context.args;
  const { api, output, options } = context;
  switch (subcommand) {
    case "list": {
      const period = await requireFiscalPeriod(api, periodId ?? null);
      const records = await loadEntryRecords(api, period.id);
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
      const period = await requireFiscalPeriod(api, periodId ?? null);
      const master = await loadMaster(api);
      const created = await api.entries.create(
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
      const period = await requireFiscalPeriod(api, periodId ?? null);
      const file = rest[0];
      if (file == null) {
        throw new CliUsageError("取り込むファイルを指定してください");
      }
      const filePath = context.resolvePath(file);
      const format = requireEntryFileFormat(
        options.format ?? path.extname(filePath).slice(1),
      );
      const text = decodeJournalImportBytes(fs.readFileSync(filePath));
      if (format === "csv") {
        await replaceEntriesFromCsv(context, period, text);
        return;
      }
      const imported = importEntriesFromJson({
        text,
        fiscalPeriodId: period.id,
      });
      const master = await loadMaster(api);
      const response = await api.entries.importMany(
        period.id,
        imported.map((entry) => entryRecordToImportPayload(entry, master)),
      );
      const skipped = imported.length - response.importedCount;
      if (options.json) {
        output.json({ imported: response.importedCount, skipped });
        return;
      }
      output.line(
        `取り込みました (取込 ${response.importedCount} 件 / 重複スキップ ${skipped} 件)`,
      );
      return;
    }
    case "export": {
      const period = await requireFiscalPeriod(api, periodId ?? null);
      const format = requireEntryFileFormat(options.format ?? "csv");
      const [entries, master] = await Promise.all([
        loadEntryRecords(api, period.id),
        loadMaster(api),
      ]);
      const manualEntries = entries.filter(
        (entry) => !isMaterializedVirtualEntry(entry),
      );
      const data =
        format === "json"
          ? `${exportEntriesAsJson(manualEntries)}\n`
          : formatJournalTableCsv(buildJournalTableRows(manualEntries, master));
      if (options.out == null) {
        output.raw(data);
        return;
      }
      const outPath = context.resolvePath(options.out);
      fs.writeFileSync(outPath, data);
      output.line(`書き出しました: ${outPath} (${manualEntries.length} 件)`);
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

function requireEntryFileFormat(format: string): EntryFileFormat {
  const normalized = format.toLowerCase();
  if (!(ENTRY_FILE_FORMATS as readonly string[]).includes(normalized)) {
    throw new CliUsageError(
      "ファイル形式は csv か json です (--format で指定できます)",
    );
  }
  return normalized as EntryFileFormat;
}

async function replaceEntriesFromCsv(
  context: CliCommandContext,
  period: FiscalPeriodApiRecord,
  text: string,
): Promise<void> {
  const { api, output, options } = context;
  const [current, master] = await Promise.all([
    loadEntryRecords(api, period.id),
    loadMaster(api),
  ]);
  const result = readJournalTableEntries(parseJournalTableCsv(text), {
    fiscalPeriodId: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    master,
  });
  if (!result.ok) {
    throw new AppError({
      messageForDeveloper: "cli: journal CSV has rows that cannot be read",
      messageForUser: [
        "取り込めない行があります。CSV を直してから、もう一度取り込んでください。",
        ...result.problems.map(
          (problem) => `  ${problem.rowNumber} 行目: ${problem.message}`,
        ),
      ].join("\n"),
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  const changes = diffJournalTableEntries(current, result.entries, master);
  const hasChanges =
    changes.added.length + changes.changed.length + changes.removed.length > 0;
  if (hasChanges && !options.yes) {
    throw new CliUsageError(
      `CSV で仕訳を置き換えます (${describeChanges(changes)})。ファイルにない仕訳は消えます。反映するときは --yes を付けてください`,
    );
  }
  if (hasChanges) await applyChanges(api, period.id, changes, master);
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

async function applyChanges(
  api: OpenkkBackendPort,
  fiscalPeriodId: string,
  changes: JournalTableChanges,
  master: EntryLineMaster,
): Promise<void> {
  const operations = journalTableOperations(changes, master);
  for (const id of operations.removeIds) {
    await api.entries.remove(fiscalPeriodId, id);
  }
  for (const update of operations.updates) {
    await api.entries.update(fiscalPeriodId, update.id, update.input);
  }
  if (operations.creates.length > 0) {
    await api.entries.importMany(fiscalPeriodId, operations.creates);
  }
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
