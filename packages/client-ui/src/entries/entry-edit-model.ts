import {
  formatBusinessRatePercent,
  parseAmount,
  resolveEntryPairMetadata,
  type BookAccountType,
  type EntryLine,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryDraft,
  EntryMasterAccountOption,
} from "@rubydogjp/openkk-client-usecases";

export type EntryLinePair = {
  id: string;
  debitLineId: string | null;
  debitAccountId: string | null;
  debitAccountName: string;
  debitAccountType: BookAccountType;
  debitAmount: string;
  creditAccountId: string | null;
  creditAccountName: string;
  creditAccountType: BookAccountType;
  creditAmount: string;
  debitPartnerName: string | null;
  debitTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  creditLineId: string | null;
  creditPartnerName: string | null;
  creditTaxCategoryId: string | null;
  creditBusinessCategoryId: string | null;
};

export type EntryFormState = {
  date: string;
  description: string;
  partner: string;
  businessRateInput: string;
  businessRate: number | null;
  taxCategory: string;
  businessCategory: string;
  pairs: EntryLinePair[];
};

export function entryRecordToDraft(record: EntryRecord): EntryDraft {
  return {
    date: record.date,
    description: record.description,
    businessRateInput: formatBusinessRatePercent(record.businessRate),
    businessRate: record.businessRate,
    lines: record.lines,
  };
}

export function entryToFormState(
  record: EntryDraft,
  nextLinePairId: () => string,
): EntryFormState {
  const lines = record.lines;
  const debits = lines.filter((line) => line.side === "debit");
  const credits = lines.filter((line) => line.side === "credit");
  const rowCount = Math.max(debits.length, credits.length, 1);
  const pairs: EntryLinePair[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const debit = debits[i] ?? null;
    const credit = credits[i] ?? null;
    pairs.push({
      id: nextLinePairId(),
      debitLineId: debit?.id ?? null,
      debitAccountId: debit?.bookAccountId ?? null,
      debitAccountName: debit?.accountName ?? "",
      debitAccountType: debit?.accountType ?? "expense",
      debitAmount: debit?.amount ?? "",
      debitPartnerName: debit?.partnerName ?? null,
      debitTaxCategoryId: debit?.taxCategoryId ?? null,
      debitBusinessCategoryId: debit?.businessCategoryId ?? null,
      creditLineId: credit?.id ?? null,
      creditAccountId: credit?.bookAccountId ?? null,
      creditAccountName: credit?.accountName ?? "",
      creditAccountType: credit?.accountType ?? "asset",
      creditAmount: credit?.amount ?? "",
      creditPartnerName: credit?.partnerName ?? null,
      creditTaxCategoryId: credit?.taxCategoryId ?? null,
      creditBusinessCategoryId: credit?.businessCategoryId ?? null,
    });
  }
  const metadata = resolveEntryPairMetadata({
    debit: debits[0] ?? null,
    credit: credits[0] ?? null,
  });
  return {
    date: record.date,
    description: record.description,
    partner: metadata.partner,
    businessRateInput: record.businessRateInput,
    businessRate: record.businessRate,
    taxCategory: metadata.taxCategory,
    businessCategory: metadata.businessCategory,
    pairs,
  };
}

export function entryFormStateToEntryDraft(
  draft: EntryFormState,
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
        id: pair.debitLineId,
        side: "debit",
        accountName: pair.debitAccountName,
        accountType: pair.debitAccountType,
        amount: pair.debitAmount,
        bookAccountId: matched?.id ?? null,
        partnerName: pair.debitPartnerName ?? draft.partner,
        taxCategoryId: pair.debitTaxCategoryId,
        taxCategoryName: draft.taxCategory,
        businessCategoryId: pair.debitBusinessCategoryId,
        businessCategoryName: draft.businessCategory,
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
        id: pair.creditLineId,
        side: "credit",
        accountName: pair.creditAccountName,
        accountType: pair.creditAccountType,
        amount: pair.creditAmount,
        bookAccountId: matched?.id ?? null,
        partnerName: pair.creditPartnerName ?? draft.partner,
        taxCategoryId: pair.creditTaxCategoryId,
        taxCategoryName: draft.taxCategory,
        businessCategoryId: pair.creditBusinessCategoryId,
        businessCategoryName: draft.businessCategory,
      });
    }
  }
  return {
    date: draft.date,
    description: draft.description,
    businessRateInput: draft.businessRateInput,
    businessRate: draft.businessRate,
    lines,
  };
}

function resolveDraftAccount(
  accountId: string | null,
  accountName: string,
  accountType: BookAccountType,
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
