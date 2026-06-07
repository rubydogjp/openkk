import {
  AppError,
  getEntryLines,
  parseAmount,
  parseBusinessRate,
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

export function safeRate(value: string): number {
  return parseBusinessRate(value);
}

/**
 * 勘定科目を ID で解決する。明示 ID → 名称+型 → 名称 の順でフォールバックし、
 * 見つからなければ null を返す。
 */
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
  const byNameAndType = input.accounts.find(
    (account) =>
      account.name === input.accountName &&
      (input.accountType == null || account.accountType === input.accountType),
  );
  if (byNameAndType != null) return byNameAndType.id;
  const found = input.accounts.find(
    (account) => account.name === input.accountName,
  );
  return found?.id ?? null;
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
    (name.trim() === "" ? "tax_exempt" : name)
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

/**
 * 仕訳レコードを取込み用ペイロードへ変換する。
 * 取込み（CSV/JSON/デモseed）とサーバ送信で同じ解決規約を使うための単一実装。
 */
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
      partnerName: entry.partner,
      taxCategoryId: "",
      businessCategoryId: "",
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
  const taxCategoryId = resolveTaxCategoryId(
    entry.debitTaxCategoryId ?? entry.creditTaxCategoryId ?? null,
    entry.taxCategory,
    master.taxes,
  );
  const businessCategoryId = resolveBusinessCategoryId(
    entry.debitBusinessCategoryId ?? entry.creditBusinessCategoryId ?? null,
    entry.businessCategory,
    master.businesses,
  );
  const linesWithCategories = lines.map((line) => ({
    ...line,
    taxCategoryId: taxCategoryId,
    businessCategoryId: businessCategoryId,
  }));
  return {
    date: entry.date,
    description: entry.description,
    localId: entry.localId,
    businessRate: safeRate(entry.businessRate),
    lines: linesWithCategories,
  };
}
