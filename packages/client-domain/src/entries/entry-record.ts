import type {
  EntryAccountVisualType,
  EntryPreviewRow,
} from "./entries-types.js";
import { parseAmount, parseBusinessRate } from "../shared/parse-utils.js";

export type EntryLine = {
  id: string | null;
  side: "debit" | "credit";
  accountName: string;
  accountType: EntryAccountVisualType;
  amount: string;
  bookAccountId: string | null;
  partnerName: string | null;
  taxCategoryId: string | null;
  taxCategoryName: string | null;
  businessCategoryId: string | null;
  businessCategoryName: string | null;
};

export type EntryLineMetadata = {
  partner: string;
  taxCategory: string;
  businessCategory: string;
};

export function resolveEntryLineMetadata(
  record: Pick<EntryRecord, "partner" | "taxCategory" | "businessCategory">,
  line: EntryLine,
): EntryLineMetadata {
  return {
    partner: line.partnerName ?? record.partner,
    taxCategory:
      line.taxCategoryName ?? line.taxCategoryId ?? record.taxCategory,
    businessCategory:
      line.businessCategoryName ??
      line.businessCategoryId ??
      record.businessCategory,
  };
}

export function resolveEntryPairMetadata(
  record: Pick<EntryRecord, "partner" | "taxCategory" | "businessCategory">,
  pair: { debit: EntryLine | null; credit: EntryLine | null },
): EntryLineMetadata {
  const debit =
    pair.debit == null ? null : resolveEntryLineMetadata(record, pair.debit);
  const credit =
    pair.credit == null ? null : resolveEntryLineMetadata(record, pair.credit);
  return {
    partner: combinePairedMetadata(debit?.partner, credit?.partner),
    taxCategory: combinePairedMetadata(
      debit?.taxCategory,
      credit?.taxCategory,
    ),
    businessCategory: combinePairedMetadata(
      debit?.businessCategory,
      credit?.businessCategory,
    ),
  };
}

function combinePairedMetadata(
  debit: string | undefined,
  credit: string | undefined,
): string {
  if (debit == null) return credit ?? "";
  if (credit == null || debit === credit) return debit;
  return `借: ${debit || "—"} / 貸: ${credit || "—"}`;
}

const OWNER_WITHDRAWAL_ACCOUNT = "事業主貸"; // 費用の個人分（資産・借方）
const OWNER_DEPOSIT_ACCOUNT = "事業主借"; // 収益の個人分（負債・貸方）
const OWNER_WITHDRAWAL_ACCOUNT_ID = "acct_proprietor_withdrawal";
const OWNER_DEPOSIT_ACCOUNT_ID = "acct_proprietor_loan";

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
        bookAccountId: toDeposit
          ? OWNER_DEPOSIT_ACCOUNT_ID
          : OWNER_WITHDRAWAL_ACCOUNT_ID,
        id: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: null,
        businessCategoryId: null,
        businessCategoryName: null,
      });
    }
  }
  return [...result, ...adjustments.values()];
}

export function resolveEntryBusinessRate(record: {
  businessRate: string;
  businessRateRatio: number | null;
}): number {
  const exact = record.businessRateRatio;
  return exact != null && Number.isFinite(exact) && exact >= 0 && exact <= 1
    ? exact
    : parseBusinessRate(record.businessRate);
}

export function entryLineAccountKey(line: EntryLine): string {
  return line.bookAccountId == null || line.bookAccountId === ""
    ? `name:${line.accountType}:${line.accountName}`
    : `id:${line.bookAccountId}`;
}

export const BUSINESS_RATE_TRANSFER_LOCAL_ID = "virtual:business-rate-transfer";

export function excludeBusinessRateTransfer<T extends { localId: string | null }>(
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
    {
      accountName: string;
      accountType: EntryAccountVisualType;
      bookAccountId: string | null;
      signed: number;
    }
  >();
  const accumulate = (lines: EntryLine[], factor: number) => {
    for (const line of lines) {
      const signed =
        (line.side === "debit" ? 1 : -1) * parseAmount(line.amount) * factor;
      const key = entryLineAccountKey(line);
      const current = delta.get(key);
      if (current == null) {
        delta.set(key, {
          accountName: line.accountName,
          accountType: line.accountType,
          bookAccountId: line.bookAccountId,
          signed,
        });
      } else {
        current.signed += signed;
      }
    }
  };

  for (const record of input.entries) {
    const rate = resolveEntryBusinessRate(record);
    if (rate >= 1) continue;
    const raw = getEntryLines(record);
    accumulate(applyBusinessRateToLines(raw, rate), 1);
    accumulate(raw, -1);
  }

  const debits: EntryLine[] = [];
  const credits: EntryLine[] = [];
  for (const {
    accountName,
    accountType,
    bookAccountId,
    signed,
  } of delta.values()) {
    const amount = Math.round(signed);
    if (amount === 0) continue;
    const line: EntryLine = {
      side: amount > 0 ? "debit" : "credit",
      accountName,
      accountType,
      amount: formatYen(Math.abs(amount)),
      bookAccountId,
      id: null,
      partnerName: null,
      taxCategoryId: null,
      taxCategoryName: null,
      businessCategoryId: null,
      businessCategoryName: null,
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
    businessRateRatio: 1,
    taxCategory: "対象外",
    businessCategory: "",
    localId: BUSINESS_RATE_TRANSFER_LOCAL_ID,
    debitBookAccountId: null,
    creditBookAccountId: null,
    debitTaxCategoryId: null,
    creditTaxCategoryId: null,
    debitBusinessCategoryId: null,
    creditBusinessCategoryId: null,
  };
}

export type EntryRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  weekday: string;

  lines: EntryLine[] | null;

  debit: string;
  debitType: EntryPreviewRow["debitType"];
  debitAmount: string;
  credit: string;
  creditType: EntryPreviewRow["creditType"];
  creditAmount: string;
  description: string;
  partner: string;
  businessRate: string;
  businessRateRatio: number | null;
  taxCategory: string;
  businessCategory: string;
  localId: string | null;
  debitBookAccountId: string | null;
  creditBookAccountId: string | null;
  debitTaxCategoryId: string | null;
  creditTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  creditBusinessCategoryId: string | null;
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
      partnerName: record.partner,
      taxCategoryId: record.debitTaxCategoryId,
      businessCategoryId: record.debitBusinessCategoryId,
      id: null,
      taxCategoryName: null,
      businessCategoryName: null,
    },
    {
      side: "credit",
      accountName: record.credit,
      accountType: record.creditType,
      amount: record.creditAmount,
      bookAccountId: record.creditBookAccountId,
      partnerName: record.partner,
      taxCategoryId: record.creditTaxCategoryId,
      businessCategoryId: record.creditBusinessCategoryId,
      id: null,
      taxCategoryName: null,
      businessCategoryName: null,
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
  return pairs.map((pair, index): EntryPreviewRow => {
    const metadata = resolveEntryPairMetadata(record, pair);
    return {
      recordId: record.id,
      lineIndex: index,
      lineCount: pairs.length,
      isFirstOfRecord: index === 0,
      date: dateLabel,
      weekday: record.weekday,
      debit: pair.debit?.accountName ?? "",
      debitType: pair.debit?.accountType ?? "asset",
      debitAmount: pair.debit?.amount ?? "",
      debitBookAccountId: pair.debit?.bookAccountId ?? null,
      debitPartnerName: pair.debit?.partnerName ?? null,
      debitTaxCategoryId: pair.debit?.taxCategoryId ?? null,
      debitBusinessCategoryId: pair.debit?.businessCategoryId ?? null,
      credit: pair.credit?.accountName ?? "",
      creditType: pair.credit?.accountType ?? "asset",
      creditAmount: pair.credit?.amount ?? "",
      creditBookAccountId: pair.credit?.bookAccountId ?? null,
      creditPartnerName: pair.credit?.partnerName ?? null,
      creditTaxCategoryId: pair.credit?.taxCategoryId ?? null,
      creditBusinessCategoryId: pair.credit?.businessCategoryId ?? null,
      description: record.description,
      partner: metadata.partner,
      businessRate: record.businessRate,
      businessRateRatio: record.businessRateRatio,
      taxCategory: metadata.taxCategory,
      businessCategory: metadata.businessCategory,
      virtual: null,
    };
  });
}

