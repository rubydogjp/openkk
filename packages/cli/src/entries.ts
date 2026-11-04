import fs from "node:fs";
import path from "node:path";
import {
  decodeJournalImportBytes,
  entryRecordToImportPayload,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  importEntriesFromCsv,
  importEntriesFromJson,
  isMaterializedVirtualEntry,
  resolveGuideBookAccount,
  storedEntryToRecord,
  type EntryLineMaster,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type { OpenkkBackendPort } from "@rubydogjp/openkk-client-ports";

import { CliUsageError } from "./cli-io.js";
import {
  requireFiscalPeriod,
  type CliCommandContext,
  type CliOptions,
} from "./command-context.js";

const ENTRY_FILE_FORMATS = ["csv", "json"] as const;
type EntryFileFormat = (typeof ENTRY_FILE_FORMATS)[number];

const CSV_BYTE_ORDER_MARK = "﻿";
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
      const format = options.format ?? path.extname(filePath).slice(1);
      const text = decodeJournalImportBytes(fs.readFileSync(filePath));
      const imported = parseEntryFile(
        requireEntryFileFormat(format),
        text,
        period.id,
      );
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
      const manualEntries = (await loadEntryRecords(api, period.id)).filter(
        (entry) => !isMaterializedVirtualEntry(entry),
      );
      const data =
        format === "json"
          ? `${exportEntriesAsJson(manualEntries)}\n`
          : `${CSV_BYTE_ORDER_MARK}${exportEntriesAsCsv(manualEntries)}\n`;
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

async function loadMaster(api: OpenkkBackendPort): Promise<EntryLineMaster> {
  const [accounts, taxCategories, businessCategories] = await Promise.all([
    api.masterData.getBookAccounts(),
    api.masterData.getTaxCategories(),
    api.masterData.getBusinessCategories(),
  ]);
  return { accounts, taxCategories, businessCategories };
}

async function loadEntryRecords(
  api: OpenkkBackendPort,
  fiscalPeriodId: string,
): Promise<EntryRecord[]> {
  const [entries, master] = await Promise.all([
    api.entries.getAll(fiscalPeriodId),
    loadMaster(api),
  ]);
  return entries
    .map((entry) => storedEntryToRecord(entry, fiscalPeriodId, master))
    .sort((left, right) => left.date.localeCompare(right.date));
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
    bookAccountId: requireAccountId(accountName, master),
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

function requireAccountId(accountName: string, master: EntryLineMaster) {
  const account = resolveGuideBookAccount(accountName, master.accounts);
  if (account == null) {
    throw new CliUsageError(`勘定科目「${accountName}」が見つかりません`);
  }
  return account.id;
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

function parseEntryFile(
  format: EntryFileFormat,
  text: string,
  fiscalPeriodId: string,
): EntryRecord[] {
  return format === "json"
    ? importEntriesFromJson({ text, fiscalPeriodId })
    : importEntriesFromCsv({ text, fiscalPeriodId });
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
