import {
  AppError,
  getEntryLines,
  parseAmount,
  resolveEntryBusinessRate,
  type EntryAccountVisualType,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryApiLineInput,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "@rubydogjp/openkk-client-ports";

export type ImportMaster = {
  accounts: Pick<MasterBookAccount, "id" | "name" | "accountType">[];
  taxes: Pick<MasterTaxCategory, "id" | "name">[];
  businesses: Pick<MasterBusinessCategory, "id" | "name">[];
};

export function optionalEntryLocalId(
  localId: string | null | undefined,
): string | undefined {
  return localId != null && localId.trim() !== "" ? localId : undefined;
}

export function resolveBookAccountId(input: {
  explicitId?: string | null;
  accountName: string;
  accountType?: EntryAccountVisualType;
  accounts: Pick<MasterBookAccount, "id" | "name" | "accountType">[];
}): string | null {
  if (input.explicitId != null && input.explicitId.length > 0) {
    const byId = input.accounts.find(
      (account) => account.id === input.explicitId,
    );
    if (byId != null) return byId.id;
  }
  const matches = input.accounts.filter(
    (account) =>
      account.name === input.accountName &&
      (input.accountType == null || account.accountType === input.accountType),
  );
  return matches.length === 1 ? matches[0]!.id : null;
}

export function resolveTaxCategoryId(
  explicitId: string | null,
  name: string,
  categories: Pick<MasterTaxCategory, "id" | "name">[],
): string {
  if (explicitId != null && explicitId.length > 0) {
    const byId = categories.find((category) => category.id === explicitId);
    if (byId != null) return byId.id;
    const byName = categories.find((category) => category.name === explicitId);
    if (byName != null) return byName.id;
  }
  return (
    categories.find((category) => category.name === name)?.id ??
    (name.trim() === "" ? "tax_out_of_scope" : name)
  );
}

export function resolveBusinessCategoryId(
  explicitId: string | null,
  name: string,
  categories: Pick<MasterBusinessCategory, "id" | "name">[],
): string {
  if (explicitId != null && explicitId.length > 0) {
    const byId = categories.find((category) => category.id === explicitId);
    if (byId != null) return byId.id;
    const byName = categories.find((category) => category.name === explicitId);
    if (byName != null) return byName.id;
  }
  return (
    categories.find((category) => category.name === name)?.id ??
    (name.trim() === "" ? "biz_none" : name)
  );
}

export function entryRecordToImportPayload(
  entry: EntryRecord,
  master: ImportMaster,
): {
  date: string;
  description: string;
  localId?: string;
  businessRate: number;
  lines: EntryApiLineInput[];
} {
  const lines = getEntryLines(entry).map(
    (line): EntryApiLineInput => ({
      side: line.side,
      bookAccountId:
        resolveBookAccountId({
          explicitId: line.bookAccountId,
          accountName: line.accountName,
          accountType: line.accountType,
          accounts: master.accounts,
        }) ?? "",
      amount: parseAmount(line.amount),
      partnerName: line.partnerName ?? entry.partner,
      taxCategoryId: resolveTaxCategoryId(
        line.taxCategoryId ?? null,
        entry.taxCategory,
        master.taxes,
      ),
      businessCategoryId: resolveBusinessCategoryId(
        line.businessCategoryId ?? null,
        entry.businessCategory,
        master.businesses,
      ),
    }),
  );
  if (lines.some((line) => line.bookAccountId === "")) {
    throw new AppError({
      messageForDeveloper: "entries.import: unresolved bookAccountId",
      messageForUser: "勘定科目の解決に失敗したため取込みできませんでした",
      originalMessage: null,
      statusCode: null,
    });
  }
  return {
    date: entry.date,
    description: entry.description,
    localId: optionalEntryLocalId(entry.localId),
    businessRate: resolveEntryBusinessRate(entry),
    lines,
  };
}
