import type { EntryAccountVisualType, EntryPreviewRow } from "./entries-types";
import { parseAmount, parseBusinessRate } from "../shared/parse-utils";

export type EntryLine = {
  side: "debit" | "credit";
  accountName: string;
  accountType: EntryAccountVisualType;
  amount: string;
  bookAccountId?: string;
};

const OWNER_WITHDRAWAL_ACCOUNT = "事業主貸"; // 費用の個人分（資産・借方）
const OWNER_DEPOSIT_ACCOUNT = "事業主借"; // 収益の個人分（負債・貸方）

function isProfitAndLossType(type: EntryAccountVisualType): boolean {
  return type === "revenue" || type === "expense" || type === "cost_of_sales";
}

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

export function applyBusinessRateToLines(
  lines: EntryLine[],
  rate: number,
): EntryLine[] {
  if (rate >= 1) return lines;
  const result: EntryLine[] = [];
  const adjustments = new Map<string, EntryLine>();
  for (const line of lines) {
    if (!isProfitAndLossType(line.accountType)) {
      result.push(line);
      continue;
    }
    const raw = parseAmount(line.amount);
    const business = Math.round(raw * rate);
    const personal = raw - business;
    result.push({ ...line, amount: formatYen(business) });
    if (personal <= 0) continue;
    const toDeposit = line.accountType === "revenue";
    const accountName = toDeposit
      ? OWNER_DEPOSIT_ACCOUNT
      : OWNER_WITHDRAWAL_ACCOUNT;
    const accountType: EntryAccountVisualType = toDeposit
      ? "liability"
      : "asset";
    const key = `${accountName}|${line.side}`;
    const existing = adjustments.get(key);
    if (existing != null) {
      existing.amount = formatYen(parseAmount(existing.amount) + personal);
    } else {
      adjustments.set(key, {
        side: line.side,
        accountName,
        accountType,
        amount: formatYen(personal),
      });
    }
  }
  return [...result, ...adjustments.values()];
}

/** EntryRecord を取得し、家事按分を反映した実効明細に変換する。 */
export function getBusinessAdjustedEntryLines(
  record: EntryRecord,
): EntryLine[] {
  return applyBusinessRateToLines(
    getEntryLines(record),
    parseBusinessRate(record.businessRate),
  );
}

export const BUSINESS_RATE_TRANSFER_LOCAL_ID = "virtual:business-rate-transfer";

export function excludeBusinessRateTransfer<T extends { localId?: string }>(
  entries: T[],
): T[] {
  return entries.filter(
    (entry) => entry.localId !== BUSINESS_RATE_TRANSFER_LOCAL_ID,
  );
}

export function buildBusinessRateTransferEntry(input: {
  fiscalPeriodId: string;
  entries: EntryRecord[];
  date: string;
}): EntryRecord | null {
  const delta = new Map<
    string,
    { accountType: EntryAccountVisualType; signed: number }
  >();
  const accumulate = (lines: EntryLine[], factor: number) => {
    for (const line of lines) {
      const signed =
        (line.side === "debit" ? 1 : -1) * parseAmount(line.amount) * factor;
      const current = delta.get(line.accountName);
      if (current == null) {
        delta.set(line.accountName, { accountType: line.accountType, signed });
      } else {
        current.signed += signed;
      }
    }
  };

  for (const record of input.entries) {
    const rate = parseBusinessRate(record.businessRate);
    if (rate >= 1) continue;
    const raw = getEntryLines(record);
    accumulate(applyBusinessRateToLines(raw, rate), 1);
    accumulate(raw, -1);
  }

  const debits: EntryLine[] = [];
  const credits: EntryLine[] = [];
  for (const [accountName, { accountType, signed }] of delta) {
    const amount = Math.round(signed);
    if (amount === 0) continue;
    const line: EntryLine = {
      side: amount > 0 ? "debit" : "credit",
      accountName,
      accountType,
      amount: formatYen(Math.abs(amount)),
    };
    (amount > 0 ? debits : credits).push(line);
  }

  const lines = [...debits, ...credits];
  if (lines.length === 0) return null;

  const debitLine = debits[0] ?? null;
  const creditLine = credits[0] ?? null;
  return {
    id: `materialized-business-rate-transfer-${input.fiscalPeriodId}`,
    fiscalPeriodId: input.fiscalPeriodId,
    date: input.date,
    weekday: "",
    lines,
    debit: debitLine?.accountName ?? "",
    debitType: debitLine?.accountType ?? "asset",
    debitAmount: debitLine?.amount ?? "",
    credit: creditLine?.accountName ?? "",
    creditType: creditLine?.accountType ?? "asset",
    creditAmount: creditLine?.amount ?? "",
    description: "家事按分の振替",
    partner: "",
    businessRate: "",
    taxCategory: "対象外",
    businessCategory: "",
    localId: BUSINESS_RATE_TRANSFER_LOCAL_ID,
  };
}

export type EntryRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  weekday: string;

  lines?: EntryLine[];

  debit: string;
  debitType: EntryPreviewRow["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryPreviewRow["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  localId?: string;
  debitBookAccountId?: string;
  creditBookAccountId?: string;
  debitTaxCategoryId?: string;
  creditTaxCategoryId?: string;
  debitBusinessCategoryId?: string;
  creditBusinessCategoryId?: string;
};

export function getEntryLines(record: EntryRecord): EntryLine[] {
  if (record.lines != null && record.lines.length > 0) {
    return record.lines;
  }
  return [
    {
      side: "debit",
      accountName: record.debit,
      accountType: record.debitType,
      amount: record.debitAmount,
      bookAccountId: record.debitBookAccountId,
    },
    {
      side: "credit",
      accountName: record.credit,
      accountType: record.creditType,
      amount: record.creditAmount,
      bookAccountId: record.creditBookAccountId,
    },
  ];
}

export function entryToVisualPairs(record: EntryRecord): Array<{
  debit: EntryLine | null;
  credit: EntryLine | null;
}> {
  const lines = getEntryLines(record);
  const debits = lines.filter((line) => line.side === "debit");
  const credits = lines.filter((line) => line.side === "credit");
  const rowCount = Math.max(debits.length, credits.length, 1);
  const pairs: Array<{ debit: EntryLine | null; credit: EntryLine | null }> =
    [];
  for (let index = 0; index < rowCount; index += 1) {
    pairs.push({
      debit: debits[index] ?? null,
      credit: credits[index] ?? null,
    });
  }
  return pairs;
}

export function recordToPreviewRows(record: EntryRecord): EntryPreviewRow[] {
  const pairs = entryToVisualPairs(record);
  const dateLabel = `${record.date.slice(5, 7)}/${record.date.slice(8, 10)}`;
  return pairs.map((pair, index) => ({
    recordId: record.id,
    lineIndex: index,
    lineCount: pairs.length,
    isFirstOfRecord: index === 0,
    date: dateLabel,
    weekday: record.weekday,
    debit: pair.debit?.accountName ?? "",
    debitType: pair.debit?.accountType ?? "asset",
    debitAmount: pair.debit?.amount ?? "",
    credit: pair.credit?.accountName ?? "",
    creditType: pair.credit?.accountType ?? "asset",
    creditAmount: pair.credit?.amount ?? "",
    description: record.description,
    partner: record.partner,
    businessRate: record.businessRate,
    taxCategory: record.taxCategory,
    businessCategory: record.businessCategory,
  }));
}

export function recordToPreviewRow(record: EntryRecord): EntryPreviewRow {
  const rows = recordToPreviewRows(record);
  return rows[0]!;
}
