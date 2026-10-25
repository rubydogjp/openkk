import {
  AppError,
  parseAmount,
  resolveCategoryId,
  resolveBookAccountId,
  type BookAccount,
  type BookAccountType,
  type EntryLine,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryLineInput,
  EntryUpsertInput,
} from "@rubydogjp/openkk-client-ports";

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
): EntryUpsertInput {
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
): EntryLineInput[] {
  return lines.map((line): EntryLineInput => {
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
