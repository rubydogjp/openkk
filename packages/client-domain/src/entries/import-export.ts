import type { EntryLine, EntryRecord } from "./entry-record";

type JournalJsonEntry = {
  id?: string;
  localId?: string;
  date: string;
  weekday?: string;
  debit: string;
  debitType: EntryRecord["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryRecord["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  lines?: EntryLine[];
};

export function exportEntriesAsJson(entries: EntryRecord[]) {
  return JSON.stringify(
    {
      schema: "openkk-journal-v1",
      entries: entries.map((entry) => ({
        localId: entry.localId ?? entry.id,
        date: entry.date,
        weekday: entry.weekday,
        debit: entry.debit,
        debitType: entry.debitType,
        debitAmount: entry.debitAmount,
        credit: entry.credit,
        creditType: entry.creditType,
        creditAmount: entry.creditAmount,
        description: entry.description,
        partner: entry.partner,
        businessRate: entry.businessRate,
        taxCategory: entry.taxCategory,
        businessCategory: entry.businessCategory,
        ...(entry.lines != null && entry.lines.length > 0
          ? { lines: entry.lines.map((line) => ({ ...line })) }
          : {}),
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
  const parsed = JSON.parse(input.text) as { entries?: unknown };
  if (!Array.isArray(parsed.entries)) {
    throw new Error("entries array not found");
  }
  const seenLocalIds = new Set<string>();
  return parsed.entries.map((raw, index) => {
    const entry = raw as JournalJsonEntry;
    const rowNo = index + 1;
    const localId = validateRequiredLocalId(
      typeof entry.localId === "string" ? entry.localId : "",
      rowNo,
      seenLocalIds,
    );
    return normalizeEntry({
      fiscalPeriodId: input.fiscalPeriodId,
      id: `entry-${input.fiscalPeriodId}-json-${index + 1}`,
      localId,
      date: entry.date,
      weekday: entry.weekday,
      debit: entry.debit,
      debitType: entry.debitType,
      debitAmount: entry.debitAmount,
      credit: entry.credit,
      creditType: entry.creditType,
      creditAmount: entry.creditAmount,
      description: entry.description,
      partner: entry.partner,
      businessRate: entry.businessRate,
      taxCategory: entry.taxCategory,
      businessCategory: entry.businessCategory,
      lines: Array.isArray(entry.lines) ? entry.lines : undefined,
    });
  });
}

const csvHeaders = [
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
  "taxCategory",
  "businessCategory",
] as const;

export function exportEntriesAsCsv(entries: EntryRecord[]) {
  const lines = [csvHeaders.join(",")];
  for (const entry of entries) {
    lines.push(
      [
        entry.localId ?? entry.id,
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
        entry.taxCategory,
        entry.businessCategory,
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
  const rows = parseCsv(input.text);
  if (rows.length < 2) {
    return [];
  }
  const header = rows[0] ?? [];
  const indexMap = Object.fromEntries(
    csvHeaders.map((name) => [name, header.indexOf(name)]),
  ) as Record<(typeof csvHeaders)[number], number>;
  if (indexMap.date < 0 || indexMap.debit < 0 || indexMap.credit < 0) {
    throw new Error("CSV header missing required columns: date, debit, credit");
  }

  const seenLocalIds = new Set<string>();
  return rows.slice(1).map((cells, index) => {
    const rowNo = index + 2;
    const localId = validateRequiredLocalId(
      readCsvCell(cells, indexMap.localId),
      rowNo,
      seenLocalIds,
    );
    return normalizeEntry({
      fiscalPeriodId: input.fiscalPeriodId,
      id: `entry-${input.fiscalPeriodId}-csv-${index + 1}`,
      localId,
      date: readCsvCell(cells, indexMap.date),
      weekday: readCsvCell(cells, indexMap.weekday),
      debit: readCsvCell(cells, indexMap.debit),
      debitType: readCsvCell(cells, indexMap.debitType) as EntryRecord["debitType"],
      debitAmount: readCsvCell(cells, indexMap.debitAmount),
      credit: readCsvCell(cells, indexMap.credit),
      creditType: readCsvCell(cells, indexMap.creditType) as EntryRecord["creditType"],
      creditAmount: readCsvCell(cells, indexMap.creditAmount),
      description: readCsvCell(cells, indexMap.description),
      partner: readCsvCell(cells, indexMap.partner),
      businessRate: readCsvCell(cells, indexMap.businessRate),
      taxCategory: readCsvCell(cells, indexMap.taxCategory),
      businessCategory: readCsvCell(cells, indexMap.businessCategory),
    });
  });
}

function normalizeEntry(input: {
  fiscalPeriodId: string;
  id: string;
  localId?: string;
  date: string;
  weekday?: string;
  debit: string;
  debitType: EntryRecord["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryRecord["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  lines?: EntryLine[];
}): EntryRecord {
  return {
    id: input.id,
    localId: input.localId,
    fiscalPeriodId: input.fiscalPeriodId,
    date: input.date,
    weekday: input.weekday && input.weekday.length > 0 ? input.weekday : weekdayFromDate(input.date),
    debit: input.debit || "未設定",
    debitType: normalizeType(input.debitType),
    debitAmount: normalizeAmount(input.debitAmount),
    credit: input.credit || "未設定",
    creditType: normalizeType(input.creditType),
    creditAmount: normalizeAmount(input.creditAmount),
    description: input.description || "",
    partner: input.partner || "",
    businessRate: input.businessRate || "100",
    taxCategory: input.taxCategory || "対象外",
    businessCategory: input.businessCategory || "対象外",
    lines: normalizeLines(input.lines),
  };
}

function normalizeLines(lines: EntryLine[] | undefined): EntryLine[] | undefined {
  if (lines == null || lines.length === 0) return undefined;
  return lines.map((line) => ({
    side: line.side === "credit" ? "credit" : "debit",
    accountName: line.accountName || "未設定",
    accountType: normalizeType(line.accountType),
    amount: normalizeAmount(line.amount),
    ...(line.bookAccountId != null && line.bookAccountId.length > 0
      ? { bookAccountId: line.bookAccountId }
      : {}),
  }));
}

function normalizeType(value: string): EntryRecord["debitType"] {
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
  return "asset";
}

function normalizeAmount(value: string) {
  const n = Number(String(value).replaceAll(",", "").trim());
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("ja-JP");
}

function weekdayFromDate(dateText: string) {
  const dt = new Date(dateText);
  if (Number.isNaN(dt.getTime())) return "月";
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[dt.getDay()] ?? "月";
}

function escapeCsvField(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
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
      throw new Error(`row ${rowNo}: duplicate localId (${localId})`);
    }
    seen.add(localId);
    return localId;
  }
  throw new Error(`row ${rowNo}: localId is required`);
}
