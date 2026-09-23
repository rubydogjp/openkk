import type { BookAccountType } from "./book-account.js";
import type { EntryPreviewRow } from "./entries-types.js";
import { parseAmount } from "../shared/parse-utils.js";

export type EntryLine = {
  id: string | null;
  side: "debit" | "credit";
  accountName: string;
  accountType: BookAccountType;
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
  line: EntryLine,
): EntryLineMetadata {
  return {
    partner: line.partnerName ?? "",
    taxCategory: line.taxCategoryName ?? line.taxCategoryId ?? "",
    businessCategory:
      line.businessCategoryName ?? line.businessCategoryId ?? "",
  };
}

export function resolveEntryPairMetadata(
  pair: { debit: EntryLine | null; credit: EntryLine | null },
): EntryLineMetadata {
  const debit =
    pair.debit == null ? null : resolveEntryLineMetadata(pair.debit);
  const credit =
    pair.credit == null ? null : resolveEntryLineMetadata(pair.credit);
  return {
    partner: combinePairedMetadata(
      debit == null ? null : debit.partner,
      credit == null ? null : credit.partner,
    ),
    taxCategory: combinePairedMetadata(
      debit == null ? null : debit.taxCategory,
      credit == null ? null : credit.taxCategory,
    ),
    businessCategory: combinePairedMetadata(
      debit == null ? null : debit.businessCategory,
      credit == null ? null : credit.businessCategory,
    ),
  };
}

function combinePairedMetadata(
  debit: string | null,
  credit: string | null,
): string {
  if (debit == null) return credit ?? "";
  if (credit == null || debit === credit) return debit;
  return `借: ${debit || "—"} / 貸: ${credit || "—"}`;
}

const PERSONAL_EXPENSE_ACCOUNT = "事業主貸";
const PERSONAL_REVENUE_ACCOUNT = "事業主借";
const PERSONAL_EXPENSE_ACCOUNT_ID = "acct_proprietor_withdrawal";
const PERSONAL_REVENUE_ACCOUNT_ID = "acct_proprietor_loan";

function isProfitAndLossType(type: BookAccountType): boolean {
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
      ? PERSONAL_REVENUE_ACCOUNT
      : PERSONAL_EXPENSE_ACCOUNT;
    const accountType: BookAccountType = toDeposit
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
          ? PERSONAL_REVENUE_ACCOUNT_ID
          : PERSONAL_EXPENSE_ACCOUNT_ID,
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

export function entryLineAccountKey(line: EntryLine): string {
  return line.bookAccountId == null || line.bookAccountId === ""
    ? `name:${line.accountType}:${line.accountName}`
    : `id:${line.bookAccountId}`;
}

export const VIRTUAL_ENTRY_LOCAL_ID_PREFIX = "virtual:";

export const BUSINESS_RATE_TRANSFER_LOCAL_ID = `${VIRTUAL_ENTRY_LOCAL_ID_PREFIX}business-rate-transfer`;

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
      accountType: BookAccountType;
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
    const rate = record.businessRate;
    if (rate >= 1) continue;
    const raw = record.lines;
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

  return {
    id: `materialized-business-rate-transfer-${input.fiscalPeriodId}`,
    fiscalPeriodId: input.fiscalPeriodId,
    date: input.date,
    weekday: "",
    lines,
    description: "家事按分の振替",
    businessRate: 1,
    localId: BUSINESS_RATE_TRANSFER_LOCAL_ID,
  };
}

export type EntryRecord = {
  id: string;
  fiscalPeriodId: string;
  date: string;
  weekday: string;

  lines: EntryLine[];
  description: string;
  businessRate: number;
  localId: string | null;
};

export function entryToVisualPairs(record: EntryRecord): Array<{
  debit: EntryLine | null;
  credit: EntryLine | null;
}> {
  const lines = record.lines;
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
    const metadata = resolveEntryPairMetadata(pair);
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
      taxCategory: metadata.taxCategory,
      businessCategory: metadata.businessCategory,
      virtual: null,
    };
  });
}
