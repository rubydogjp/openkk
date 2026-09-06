import {
  getEntryLines,
  parseAmount,
  type EntryAccountVisualType,
  type EntryLine,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryDraft,
  EntryMasterAccountOption,
} from "@rubydogjp/openkk-client-usecases";

export type EntryLinePair = {
  id: string;
  debitLineId?: string;
  debitAccountId?: string;
  debitAccountName: string;
  debitAccountType: EntryAccountVisualType;
  debitAmount: string;
  creditAccountId?: string;
  creditAccountName: string;
  creditAccountType: EntryAccountVisualType;
  creditAmount: string;
  debitPartnerName: string | null;
  debitTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  creditLineId?: string;
  creditPartnerName: string | null;
  creditTaxCategoryId: string | null;
  creditBusinessCategoryId: string | null;
};

export type EntryFormDraft = {
  date: string;
  description: string;
  partner: string;
  businessRate: string;
  businessRateRatio?: number;
  taxCategory: string;
  businessCategory: string;
  pairs: EntryLinePair[];
};

export function entryRecordToFormDraft(
  record: EntryRecord,
  nextLinePairId: () => string,
): EntryFormDraft {
  const lines = getEntryLines(record);
  const debits = lines.filter((line) => line.side === "debit");
  const credits = lines.filter((line) => line.side === "credit");
  const rowCount = Math.max(debits.length, credits.length, 1);
  const pairs: EntryLinePair[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const debit = debits[i] ?? null;
    const credit = credits[i] ?? null;
    pairs.push({
      id: nextLinePairId(),
      debitLineId: debit?.id,
      debitAccountId: debit?.bookAccountId,
      debitAccountName: debit?.accountName ?? "",
      debitAccountType: debit?.accountType ?? "expense",
      debitAmount: debit?.amount ?? "",
      debitPartnerName: debit?.partnerName ?? null,
      debitTaxCategoryId: debit?.taxCategoryId ?? null,
      debitBusinessCategoryId: debit?.businessCategoryId ?? null,
      creditLineId: credit?.id,
      creditAccountId: credit?.bookAccountId,
      creditAccountName: credit?.accountName ?? "",
      creditAccountType: credit?.accountType ?? "asset",
      creditAmount: credit?.amount ?? "",
      creditPartnerName: credit?.partnerName ?? null,
      creditTaxCategoryId: credit?.taxCategoryId ?? null,
      creditBusinessCategoryId: credit?.businessCategoryId ?? null,
    });
  }
  return {
    date: record.date,
    description: record.description,
    partner: record.partner,
    businessRate: record.businessRate,
    businessRateRatio: record.businessRateRatio,
    taxCategory: record.taxCategory,
    businessCategory: record.businessCategory,
    pairs,
  };
}

export function entryFormDraftToEntryDraft(
  draft: EntryFormDraft,
  accounts: EntryMasterAccountOption[],
): EntryDraft {
  const lines: EntryLine[] = [];
  for (const pair of draft.pairs) {
    if (
      pair.debitAccountName.trim().length > 0 &&
      parseAmount(pair.debitAmount) > 0
    ) {
      const matched = resolveDraftAccount(
        pair.debitAccountId,
        pair.debitAccountName,
        pair.debitAccountType,
        accounts,
      );
      lines.push({
        ...(pair.debitLineId == null ? {} : { id: pair.debitLineId }),
        side: "debit",
        accountName: pair.debitAccountName,
        accountType: pair.debitAccountType,
        amount: pair.debitAmount,
        bookAccountId: matched?.id,
        ...(pair.debitPartnerName == null
          ? {}
          : { partnerName: pair.debitPartnerName }),
        ...(pair.debitTaxCategoryId == null
          ? {}
          : { taxCategoryId: pair.debitTaxCategoryId }),
        ...(pair.debitBusinessCategoryId == null
          ? {}
          : { businessCategoryId: pair.debitBusinessCategoryId }),
      });
    }
    if (
      pair.creditAccountName.trim().length > 0 &&
      parseAmount(pair.creditAmount) > 0
    ) {
      const matched = resolveDraftAccount(
        pair.creditAccountId,
        pair.creditAccountName,
        pair.creditAccountType,
        accounts,
      );
      lines.push({
        ...(pair.creditLineId == null ? {} : { id: pair.creditLineId }),
        side: "credit",
        accountName: pair.creditAccountName,
        accountType: pair.creditAccountType,
        amount: pair.creditAmount,
        bookAccountId: matched?.id,
        ...(pair.creditPartnerName == null
          ? {}
          : { partnerName: pair.creditPartnerName }),
        ...(pair.creditTaxCategoryId == null
          ? {}
          : { taxCategoryId: pair.creditTaxCategoryId }),
        ...(pair.creditBusinessCategoryId == null
          ? {}
          : { businessCategoryId: pair.creditBusinessCategoryId }),
      });
    }
  }
  return {
    date: draft.date,
    description: draft.description,
    partner: draft.partner,
    businessRate: draft.businessRate,
    businessRateRatio: draft.businessRateRatio,
    taxCategory: draft.taxCategory,
    businessCategory: draft.businessCategory,
    lines,
  };
}

function resolveDraftAccount(
  accountId: string | undefined,
  accountName: string,
  accountType: EntryAccountVisualType,
  accounts: EntryMasterAccountOption[],
): EntryMasterAccountOption | null {
  const explicit = accounts.find((account) => account.id === accountId);
  if (explicit != null) return explicit;
  const matches = accounts.filter(
    (account) =>
      account.name === accountName && account.accountType === accountType,
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function mergeOptions(
  primary: Iterable<string>,
  secondary: Iterable<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...primary, ...secondary]) {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
