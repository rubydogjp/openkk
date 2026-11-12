import { AppError } from "../shared/app-error.js";
import { formatAmount, parseAmount, weekdayJa } from "../shared/parse-utils.js";
import type { BookAccount, BookAccountType } from "./book-account.js";
import { resolveBookAccountId } from "./book-account.js";
import { resolveCategoryId } from "./category-resolution.js";
import type { EntryLine, EntryRecord } from "./entry-record.js";

export type EntryLineInputRecord = {
  side: "debit" | "credit";
  bookAccountId: string;
  amount: number;
  partnerName: string;
  taxCategoryId: string;
  businessCategoryId: string;
};

export type EntryInputRecord = {
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: EntryLineInputRecord[];
};

export type StoredEntryRecord = {
  id: string;
  date: string;
  description: string;
  localId: string | null;
  businessRate: number;
  lines: ReadonlyArray<EntryLineInputRecord>;
};

export type EntryLineMaster = {
  accounts: ReadonlyArray<BookAccount>;
  taxCategories: ReadonlyArray<{ id: string; name: string }>;
  businessCategories: ReadonlyArray<{ id: string; name: string }>;
};

export type UnresolvedAccountMessages = {
  messageForDeveloper: string;
  messageForUser: string;
};

export function entryRecordToImportPayload(
  entry: EntryRecord,
  master: EntryLineMaster,
): EntryInputRecord {
  return {
    date: entry.date,
    description: entry.description,
    localId: entry.localId,
    businessRate: entry.businessRate,
    lines: entryLinesToInputs(entry.lines, master, {
      messageForDeveloper: "entries.import: unresolved bookAccountId",
      messageForUser: "勘定科目の解決に失敗したため取込みできませんでした",
    }),
  };
}

export function entryLinesToInputs(
  lines: ReadonlyArray<EntryLine>,
  master: EntryLineMaster,
  unresolvedAccount: UnresolvedAccountMessages,
): EntryLineInputRecord[] {
  return lines.map((line): EntryLineInputRecord => {
    const bookAccountId = resolveBookAccountId({
      explicitId: line.bookAccountId,
      accountName: line.accountName,
      accountType: withProprietorLoanAsEquity(
        line.accountName,
        line.accountType,
      ),
      accounts: master.accounts,
    });
    if (bookAccountId == null) {
      throw new AppError({
        ...unresolvedAccount,
        originalMessage: null,
        statusCode: null,
        code: null,
      });
    }
    return {
      side: line.side,
      bookAccountId,
      amount: parseAmount(line.amount),
      partnerName: line.partnerName ?? "",
      taxCategoryId: resolveCategoryId(
        line.taxCategoryId,
        line.taxCategoryName ?? "",
        master.taxCategories,
        "tax_out_of_scope",
      ),
      businessCategoryId: resolveCategoryId(
        line.businessCategoryId,
        line.businessCategoryName ?? "",
        master.businessCategories,
        "biz_none",
      ),
    };
  });
}

const PROPRIETOR_LOAN_ACCOUNT_NAME = "事業主借";

function withProprietorLoanAsEquity(
  accountName: string,
  accountType: BookAccountType,
): BookAccountType {
  return accountName.trim() === PROPRIETOR_LOAN_ACCOUNT_NAME &&
    accountType === "liability"
    ? "equity"
    : accountType;
}

export function storedEntryToRecord(
  entry: StoredEntryRecord,
  fiscalPeriodId: string,
  master: EntryLineMaster,
): EntryRecord {
  const lines = entry.lines.map((line): EntryLine => {
    const account = master.accounts.find(
      (candidate) => candidate.id === line.bookAccountId,
    );
    return {
      side: line.side,
      accountName: account?.name ?? line.bookAccountId,
      accountType: account?.accountType ?? "asset",
      amount: formatAmount(Math.abs(line.amount)),
      bookAccountId: line.bookAccountId,
      partnerName: line.partnerName,
      taxCategoryId: line.taxCategoryId,
      taxCategoryName: categoryName(line.taxCategoryId, master.taxCategories),
      businessCategoryId: line.businessCategoryId,
      businessCategoryName: categoryName(
        line.businessCategoryId,
        master.businessCategories,
      ),
      id: null,
    };
  });
  return {
    id: entry.id,
    fiscalPeriodId,
    date: entry.date,
    weekday: weekdayJa(entry.date),
    lines,
    description: entry.description,
    businessRate: entry.businessRate,
    localId: entry.localId,
  };
}

function categoryName(
  id: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (id.length === 0) return "対象外";
  return categories.find((category) => category.id === id)?.name ?? id;
}
