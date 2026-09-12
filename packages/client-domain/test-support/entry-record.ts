import type {
  EntryLine,
  EntryRecord,
} from "../src/entries/entry-record.js";
import type { BookAccountType } from "../src/entries/book-account.js";

type PairFields = {
  debit: string;
  debitType: BookAccountType;
  debitAmount: string;
  credit: string;
  creditType: BookAccountType;
  creditAmount: string;
  partner: string;
  taxCategory: string;
  businessCategory: string;
  debitBookAccountId: string | null;
  creditBookAccountId: string | null;
  debitTaxCategoryId: string | null;
  creditTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  creditBusinessCategoryId: string | null;
};

export type EntryRecordOverrides = Partial<
  Omit<EntryRecord, "lines"> & PairFields & { lines: EntryLine[] }
>;

const DEFAULTS: Omit<EntryRecord, "lines"> & PairFields = {
  id: "entry-1",
  fiscalPeriodId: "fp-1",
  date: "2026-01-01",
  weekday: "木",
  debit: "普通預金",
  debitType: "asset",
  debitAmount: "0",
  credit: "普通預金",
  creditType: "asset",
  creditAmount: "0",
  description: "test",
  partner: "",
  businessRate: 1,
  taxCategory: "対象外",
  businessCategory: "",
  localId: null,
  debitBookAccountId: null,
  creditBookAccountId: null,
  debitTaxCategoryId: null,
  creditTaxCategoryId: null,
  debitBusinessCategoryId: null,
  creditBusinessCategoryId: null,
};

export function entryRecord(
  overrides: EntryRecordOverrides = {},
  defaults: EntryRecordOverrides = {},
): EntryRecord {
  const input = { ...DEFAULTS, ...defaults, ...overrides };
  const lines = input.lines ?? [pairLine("debit", input), pairLine("credit", input)];
  return {
    id: input.id,
    fiscalPeriodId: input.fiscalPeriodId,
    date: input.date,
    weekday: input.weekday,
    lines,
    description: input.description,
    businessRate: input.businessRate,
    localId: input.localId,
  };
}

function pairLine(
  side: EntryLine["side"],
  input: Omit<EntryRecord, "lines"> & PairFields,
): EntryLine {
  const debit = side === "debit";
  return {
    id: null,
    side,
    accountName: debit ? input.debit : input.credit,
    accountType: debit ? input.debitType : input.creditType,
    amount: debit ? input.debitAmount : input.creditAmount,
    bookAccountId: debit
      ? input.debitBookAccountId
      : input.creditBookAccountId,
    partnerName: input.partner,
    taxCategoryId: debit
      ? input.debitTaxCategoryId
      : input.creditTaxCategoryId,
    taxCategoryName: input.taxCategory,
    businessCategoryId: debit
      ? input.debitBusinessCategoryId
      : input.creditBusinessCategoryId,
    businessCategoryName: input.businessCategory,
  };
}
