import {
  AppError,
  parseAmount,
  resolveCategoryId,
  resolveBookAccountId,
  type BookAccount,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryApiLineInput,
  EntryUpsertInput,
} from "@rubydogjp/openkk-client-ports";

export type ImportMaster = {
  accounts: BookAccount[];
  taxes: Array<{ id: string; name: string }>;
  businesses: Array<{ id: string; name: string }>;
};

export function entryRecordToImportPayload(
  entry: EntryRecord,
  master: ImportMaster,
): EntryUpsertInput {
  const lines = entry.lines.map((line): EntryApiLineInput => {
    const bookAccountId = resolveBookAccountId({
      explicitId: line.bookAccountId,
      accountName: line.accountName,
      accountType: line.accountType,
      accounts: master.accounts,
    });
    if (bookAccountId == null) {
      throw new AppError({
        messageForDeveloper: "entries.import: unresolved bookAccountId",
        messageForUser: "勘定科目の解決に失敗したため取込みできませんでした",
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
        master.taxes,
        "tax_out_of_scope",
      ),
      businessCategoryId: resolveCategoryId(
        line.businessCategoryId,
        line.businessCategoryName ?? "",
        master.businesses,
        "biz_none",
      ),
    };
  });
  return {
    date: entry.date,
    description: entry.description,
    localId: entry.localId,
    businessRate: entry.businessRate,
    lines,
  };
}
