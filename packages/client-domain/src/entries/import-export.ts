import {
  getEntryLines,
  type EntryLine,
  type EntryRecord,
} from "./entry-record.js";
import { AppError } from "../shared/app-error.js";
import { parseIsoLocalDate, weekdayJa } from "../shared/parse-utils.js";
import {
  assertJournalEntryLineCount,
  assertJournalImportEntryCount,
  assertJournalImportLineCount,
  assertJournalImportSize,
} from "./journal-import-policy.js";

export {
  assertJournalImportSize,
  MAX_JOURNAL_ENTRY_LINES,
  MAX_JOURNAL_IMPORT_ENTRIES,
  MAX_JOURNAL_IMPORT_LINES,
  MAX_JOURNAL_IMPORT_SIZE,
} from "./journal-import-policy.js";

type JournalJsonEntry = {
  id: string | null;
  localId: string | null;
  date: string;
  weekday: string | null;
  debit: string;
  debitType: EntryRecord["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryRecord["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  businessRateRatio: number | null;
  taxCategory: string;
  businessCategory: string;
  lines: EntryLine[] | null;
};

export const OPENKK_JOURNAL_SCHEMA = "openkk-journal-v1";

export function exportEntriesAsJson(entries: EntryRecord[]) {
  return JSON.stringify(
    {
      schema: OPENKK_JOURNAL_SCHEMA,
      entries: entries.map((entry) => ({
        localId:
          entry.localId == null || entry.localId.trim() === ""
            ? entry.id
            : entry.localId,
        date: entry.date,
        weekday: entry.weekday ?? null,
        debit: entry.debit,
        debitType: entry.debitType,
        debitAmount: entry.debitAmount,
        credit: entry.credit,
        creditType: entry.creditType,
        creditAmount: entry.creditAmount,
        description: entry.description,
        partner: entry.partner,
        businessRate: entry.businessRate,
        businessRateRatio: entry.businessRateRatio ?? null,
        taxCategory: entry.taxCategory,
        businessCategory: entry.businessCategory,
        lines: getEntryLines(entry).map((line) => ({ ...line })),
      })),
    },
    null,
    2,
  );
}

export function importEntriesFromJson(input: {
  text: string;
  fiscalPeriodId: string;
}): EntryRecord[] {
  assertJournalImportSize(input.text.length);
  const parsed = parseEntriesJson(input.text);
  if (
    parsed.schema != null &&
    parsed.schema !== "" &&
    parsed.schema !== OPENKK_JOURNAL_SCHEMA
  ) {
    throw importFileFormatError(
      `unsupported journal schema: ${String(parsed.schema)}`,
    );
  }
  if (!Array.isArray(parsed.entries)) {
    throw importFileFormatError("entries array not found");
  }
  assertJournalImportEntryCount(parsed.entries.length);
  const seenLocalIds = new Set<string>();
  let importLineCount = 0;
  return parsed.entries.map((raw, index) => {
    const rowNo = index + 1;
    if (!isRecord(raw)) {
      throw importFileRowError(`row ${rowNo}: entry must be an object`, rowNo);
    }
    const entry = raw as Partial<JournalJsonEntry>;
    const localId = validateRequiredLocalId(
      typeof entry.localId === "string" ? entry.localId : "",
      rowNo,
      seenLocalIds,
    );
    const normalized = normalizeEntry({
      fiscalPeriodId: input.fiscalPeriodId,
      id: `entry-${input.fiscalPeriodId}-json-${index + 1}`,
      rowNo,
      localId,
      date: stringValue(entry.date),
      weekday: entry.weekday ?? null,
      debit: stringValue(entry.debit),
      debitType: stringValue(entry.debitType) as EntryRecord["debitType"],
      debitAmount: stringValue(entry.debitAmount),
      credit: stringValue(entry.credit),
      creditType: stringValue(entry.creditType) as EntryRecord["creditType"],
      creditAmount: stringValue(entry.creditAmount),
      description: stringValue(entry.description),
      partner: stringValue(entry.partner),
      businessRate: stringValue(entry.businessRate),
      businessRateRatio: entry.businessRateRatio ?? null,
      taxCategory: stringValue(entry.taxCategory),
      businessCategory: stringValue(entry.businessCategory),
      lines: validateJsonLines(entry.lines, rowNo),
    });
    importLineCount += normalized.lines?.length ?? 2;
    assertJournalImportLineCount(importLineCount);
    return normalized;
  });
}

const journalCsvDataHeaders = [
  "localId",
  "date",
  "weekday",
  "debit",
  "debitType",
  "debitAmount",
  "credit",
  "creditType",
  "creditAmount",
  "description",
  "partner",
  "businessRate",
  "businessRateRatio",
  "taxCategory",
  "businessCategory",
  "lines",
] as const;

const csvHeaders = [
  ...journalCsvDataHeaders,
  "openkkSchema",
  "openkkEscapedFields",
] as const;

const OPENKK_JOURNAL_CSV_SCHEMA = "openkk-journal-csv-v1";

export function exportEntriesAsCsv(entries: EntryRecord[]) {
  const lines = [csvHeaders.join(",")];
  for (const entry of entries) {
    const rawValues = [
      entry.localId == null || entry.localId.trim() === ""
        ? entry.id
        : entry.localId,
      entry.date,
      entry.weekday,
      entry.debit,
      entry.debitType,
      entry.debitAmount,
      entry.credit,
      entry.creditType,
      entry.creditAmount,
      entry.description,
      entry.partner,
      entry.businessRate,
      entry.businessRateRatio == null ? "" : String(entry.businessRateRatio),
      entry.taxCategory,
      entry.businessCategory,
      JSON.stringify(getEntryLines(entry)),
    ];
    const escapedFields: Array<(typeof journalCsvDataHeaders)[number]> = [];
    const safeValues = rawValues.map((value, index) => {
      if (!needsSpreadsheetFormulaProtection(value)) return value;
      const fieldName = journalCsvDataHeaders[index];
      if (fieldName != null) escapedFields.push(fieldName);
      return `'${value}`;
    });
    lines.push(
      [
        ...safeValues,
        OPENKK_JOURNAL_CSV_SCHEMA,
        JSON.stringify(escapedFields),
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function importEntriesFromCsv(input: {
  text: string;
  fiscalPeriodId: string;
}): EntryRecord[] {
  assertJournalImportSize(input.text.length);
  const rows = parseCsv(stripBom(input.text));
  const header = rows[0] ?? [];
  const indexMap = Object.fromEntries(
    csvHeaders.map((name) => [name, header.indexOf(name)]),
  ) as Record<(typeof csvHeaders)[number], number>;
  if (
    indexMap.localId < 0 ||
    indexMap.date < 0 ||
    indexMap.debit < 0 ||
    indexMap.credit < 0
  ) {
    throw importFileFormatError(
      "CSV header missing required columns: localId, date, debit, credit",
    );
  }
  if (rows.length < 2) return [];
  assertJournalImportEntryCount(rows.length - 1);

  const seenLocalIds = new Set<string>();
  let importLineCount = 0;
  return rows.slice(1).map((cells, index) => {
    const rowNo = index + 2;
    const escapedFields = parseCsvEscapedFields(cells, indexMap, rowNo);
    const read = (field: (typeof journalCsvDataHeaders)[number]) =>
      readJournalCsvCell(cells, indexMap[field], escapedFields.has(field));
    const localId = validateRequiredLocalId(
      read("localId"),
      rowNo,
      seenLocalIds,
    );
    const normalized = normalizeEntry({
      fiscalPeriodId: input.fiscalPeriodId,
      id: `entry-${input.fiscalPeriodId}-csv-${index + 1}`,
      rowNo,
      localId,
      date: read("date"),
      weekday: read("weekday"),
      debit: read("debit"),
      debitType: read("debitType") as EntryRecord["debitType"],
      debitAmount: read("debitAmount"),
      credit: read("credit"),
      creditType: read("creditType") as EntryRecord["creditType"],
      creditAmount: read("creditAmount"),
      description: read("description"),
      partner: read("partner"),
      businessRate: read("businessRate"),
      businessRateRatio: read("businessRateRatio"),
      taxCategory: read("taxCategory"),
      businessCategory: read("businessCategory"),
      lines: parseCsvLinesCell(read("lines"), rowNo),
    });
    importLineCount += normalized.lines?.length ?? 2;
    assertJournalImportLineCount(importLineCount);
    return normalized;
  });
}

export function decodeJournalImportBytes(bytes: Uint8Array): string {
  assertJournalImportSize(bytes.byteLength);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new AppError({
      messageForDeveloper: "entries import is not valid UTF-8",
      messageForUser:
        "取込ファイルの文字コードを確認できませんでした。UTF-8形式で保存してからもう一度取り込んでください。",
      originalMessage: error instanceof Error ? error.message : String(error),
      statusCode: null,
    });
  }
}

function parseCsvLinesCell(
  raw: string,
  rowNo: number,
): EntryLine[] | null {
  if (raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw importFileRowError(`row ${rowNo}: invalid lines JSON`, rowNo);
  }
  if (!Array.isArray(parsed)) {
    throw importFileRowError(`row ${rowNo}: lines must be an array`, rowNo);
  }
  return parsed as EntryLine[];
}

function normalizeEntry(input: {
  fiscalPeriodId: string;
  id: string;
  rowNo: number;
  localId: string | null;
  date: string;
  weekday: string | null;
  debit: string;
  debitType: EntryRecord["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryRecord["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  businessRateRatio: unknown | null;
  taxCategory: string;
  businessCategory: string;
  lines: EntryLine[] | null;
}): EntryRecord {
  if (parseIsoLocalDate(input.date) == null) {
    throw importFileRowError(
      `row ${input.rowNo}: invalid date (${input.date})`,
      input.rowNo,
    );
  }
  const result: EntryRecord = {
    id: input.id,
    localId: input.localId,
    fiscalPeriodId: input.fiscalPeriodId,
    date: input.date,
    weekday: weekdayFromDate(input.date),
    debit: input.debit.trim(),
    debitType: normalizeType(input.debitType, input.rowNo, "debit type"),
    debitAmount: normalizeAmount(
      input.debitAmount,
      input.rowNo,
      "debit amount",
    ),
    credit: input.credit.trim(),
    creditType: normalizeType(input.creditType, input.rowNo, "credit type"),
    creditAmount: normalizeAmount(
      input.creditAmount,
      input.rowNo,
      "credit amount",
    ),
    description: input.description || "",
    partner: input.partner || "",
    businessRate: input.businessRate || "100",
    businessRateRatio: normalizeBusinessRateRatio(
      input.businessRateRatio,
      input.rowNo,
    ),
    taxCategory: input.taxCategory || "対象外",
    businessCategory: input.businessCategory || "対象外",
    lines: normalizeLines(input.lines, input.rowNo),
    debitBookAccountId: null,
    creditBookAccountId: null,
    debitTaxCategoryId: null,
    creditTaxCategoryId: null,
    debitBusinessCategoryId: null,
    creditBusinessCategoryId: null,
  };
  assertNormalizedEntry(result, input.rowNo);
  return result;
}

function normalizeBusinessRateRatio(
  value: unknown,
  rowNo: number,
): number | null {
  if (value == null || value === "") return null;
  const rate =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw importFileRowError(
      `row ${rowNo}: invalid exact business rate`,
      rowNo,
    );
  }
  return rate;
}

function normalizeLines(
  lines: EntryLine[] | null,
  rowNo: number,
): EntryLine[] | null {
  if (lines == null || lines.length === 0) return null;
  assertJournalEntryLineCount(lines.length);
  return lines.map((line, index): EntryLine => {
    if (!isRecord(line)) {
      throw importFileRowError(
        `row ${rowNo}: line ${index + 1} must be an object`,
        rowNo,
      );
    }
    if (line.side !== "debit" && line.side !== "credit") {
      throw importFileRowError(
        `row ${rowNo}: line ${index + 1} has invalid side`,
        rowNo,
      );
    }
    const accountName = stringValue(line.accountName).trim();
    if (accountName === "") {
      throw importFileRowError(
        `row ${rowNo}: line ${index + 1} account is required`,
        rowNo,
      );
    }
    const bookAccountId = stringValue(line.bookAccountId).trim();
    const partnerName = stringValue(line.partnerName).trim();
    const taxCategoryId = stringValue(line.taxCategoryId).trim();
    const businessCategoryId = stringValue(line.businessCategoryId).trim();
    return {
      side: line.side,
      accountName,
      accountType: normalizeType(
        stringValue(line.accountType),
        rowNo,
        `line ${index + 1} account type`,
      ),
      amount: normalizeAmount(
        stringValue(line.amount),
        rowNo,
        `line ${index + 1} amount`,
      ),
      id: null,
      bookAccountId: bookAccountId === "" ? null : bookAccountId,
      partnerName: partnerName === "" ? null : partnerName,
      taxCategoryId: taxCategoryId === "" ? null : taxCategoryId,
      taxCategoryName: null,
      businessCategoryId:
        businessCategoryId === "" ? null : businessCategoryId,
      businessCategoryName: null,
    };
  });
}

function normalizeType(
  value: string,
  rowNo: number | null,
  label = "account type",
): EntryRecord["debitType"] {
  if (
    value === "asset" ||
    value === "liability" ||
    value === "equity" ||
    value === "revenue" ||
    value === "cost_of_sales" ||
    value === "expense"
  ) {
    return value;
  }
  if (value.trim() === "") return "asset";
  throw importFileRowError(
    `row ${rowNo}: invalid ${label} (${value})`,
    rowNo ?? 0,
  );
}

function normalizeAmount(
  value: string,
  rowNo: number | null,
  label = "amount",
) {
  const n = Number(String(value).replaceAll(",", "").trim());
  if (!Number.isSafeInteger(n) || n < 0) {
    throw importFileRowError(
      `row ${rowNo}: invalid ${label} (${value})`,
      rowNo ?? 0,
    );
  }
  return n.toLocaleString("ja-JP");
}

function weekdayFromDate(dateText: string) {
  return weekdayJa(dateText) || "月";
}

function escapeCsvField(value: string) {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function needsSpreadsheetFormulaProtection(value: string): boolean {
  return /^[=+\-@\t\r\n]/.test(value);
}

function parseCsvEscapedFields(
  cells: string[],
  indexMap: Record<(typeof csvHeaders)[number], number>,
  rowNo: number,
): Set<(typeof journalCsvDataHeaders)[number]> {
  if (
    readCsvCell(cells, indexMap.openkkSchema) !== OPENKK_JOURNAL_CSV_SCHEMA
  ) {
    return new Set();
  }
  const raw = readCsvCell(cells, indexMap.openkkEscapedFields);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw importFileRowError(
      `row ${rowNo}: invalid escaped fields metadata`,
      rowNo,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (field) =>
        !isJournalCsvDataHeader(field),
    )
  ) {
    throw importFileRowError(
      `row ${rowNo}: invalid escaped fields metadata`,
      rowNo,
    );
  }
  return new Set(parsed as Array<(typeof journalCsvDataHeaders)[number]>);
}

function isJournalCsvDataHeader(
  value: unknown,
): value is (typeof journalCsvDataHeaders)[number] {
  return (
    typeof value === "string" &&
    (journalCsvDataHeaders as readonly string[]).includes(value)
  );
}

function readJournalCsvCell(
  cells: string[],
  index: number,
  formulaProtected: boolean,
): string {
  const value = readCsvCell(cells, index);
  return formulaProtected && value.startsWith("'") ? value.slice(1) : value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "start" | "unquoted" | "quoted" | "after_quote" = "start";

  const finishField = () => {
    row.push(field);
    field = "";
    state = "start";
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          state = "after_quote";
        }
      } else {
        field += ch;
      }
      continue;
    }

    const isLineBreak = ch === "\n" || ch === "\r";
    if (state === "after_quote") {
      if (ch === ",") {
        finishField();
        continue;
      }
      if (isLineBreak) {
        finishRow();
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        continue;
      }
      throw importFileFormatError(
        "CSV has an unexpected character after a closing quote",
      );
    }

    if (ch === '"') {
      if (state !== "start") {
        throw importFileFormatError(
          "CSV has an unexpected quote in an unquoted field",
        );
      }
      state = "quoted";
      continue;
    }
    if (ch === ",") {
      finishField();
      continue;
    }
    if (isLineBreak) {
      finishRow();
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      continue;
    }
    field += ch;
    state = "unquoted";
  }
  if (state === "quoted") {
    throw importFileFormatError("CSV has an unterminated quoted field");
  }
  finishRow();
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function validateJsonLines(
  value: unknown,
  rowNo: number,
): EntryLine[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    throw importFileRowError(`row ${rowNo}: lines must be an array`, rowNo);
  }
  return value as EntryLine[];
}

function assertNormalizedEntry(entry: EntryRecord, rowNo: number): void {
  if (entry.description.trim() === "") {
    throw importFileRowError(`row ${rowNo}: description is required`, rowNo);
  }
  const lines =
    entry.lines != null && entry.lines.length > 0
      ? entry.lines
      : [
          {
            side: "debit" as const,
            accountName: entry.debit,
            accountType: entry.debitType,
            amount: entry.debitAmount,
          },
          {
            side: "credit" as const,
            accountName: entry.credit,
            accountType: entry.creditType,
            amount: entry.creditAmount,
          },
        ];
  for (const line of lines) {
    if (line.accountName.trim() === "") {
      throw importFileRowError(`row ${rowNo}: account is required`, rowNo);
    }
  }
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    const amount = numericAmount(line.amount);
    if (line.side === "debit") debitTotal += amount;
    else creditTotal += amount;
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      throw importFileRowError(
        `row ${rowNo}: entry totals exceed the safe integer range`,
        rowNo,
      );
    }
  }
  if (debitTotal <= 0 || creditTotal <= 0 || debitTotal !== creditTotal) {
    throw importFileRowError(
      `row ${rowNo}: debit and credit totals must be positive and equal`,
      rowNo,
    );
  }
  const rateText = entry.businessRate.trim();
  const rate = rateText === "" ? 100 : Number(rateText);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw importFileRowError(`row ${rowNo}: invalid business rate`, rowNo);
  }
}

function numericAmount(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function readCsvCell(cells: string[], index: number) {
  if (index < 0) return "";
  return cells[index] ?? "";
}

function validateRequiredLocalId(
  rawLocalId: string,
  rowNo: number,
  seen: Set<string>,
) {
  const localId = rawLocalId.trim();
  if (localId.length > 0) {
    if (seen.has(localId)) {
      throw importFileRowError(
        `row ${rowNo}: duplicate localId (${localId})`,
        rowNo,
      );
    }
    seen.add(localId);
    return localId;
  }
  throw importFileRowError(`row ${rowNo}: localId is required`, rowNo);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseEntriesJson(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stripBom(text));
    if (!isRecord(parsed)) {
      throw new Error("journal JSON root must be an object");
    }
    return parsed;
  } catch (error) {
    throw new AppError({
      messageForDeveloper: "entries import JSON parse failed",
      messageForUser:
        "JSONファイルの内容を確認できませんでした。ファイルの形式を確認してください。",
      originalMessage: error instanceof Error ? error.message : String(error),
      statusCode: null,
    });
  }
}

function importFileFormatError(messageForDeveloper: string): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser:
      "取込ファイルの形式を確認できませんでした。オープン会計で書き出したCSVまたはJSONを選択してください。",
    originalMessage: null,
    statusCode: null,
  });
}

function importFileRowError(
  messageForDeveloper: string,
  rowNo: number,
): AppError {
  return new AppError({
    messageForDeveloper,
    messageForUser: `${rowNo}行目の取引データを確認できませんでした。ファイルの内容を修正してからもう一度取り込んでください。`,
    originalMessage: null,
    statusCode: null,
  });
}
