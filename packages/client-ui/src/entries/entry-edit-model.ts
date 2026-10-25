import {
  entryToVisualPairs,
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
  debitPartnerName: string | null;
  debitTaxCategoryId: string | null;
  debitBusinessCategoryId: string | null;
  creditLineId: string | null;
  creditAccountId: string | null;
  creditAccountName: string;
  creditAccountType: BookAccountType;
  creditAmount: string;
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

export function newEntryLinePair(
  id: string,
  debit: EntryMasterAccountOption | null,
  credit: EntryMasterAccountOption | null,
): EntryLinePair {
  return {
    id,
    debitLineId: null,
    debitAccountId: debit?.id ?? null,
    debitAccountName: debit?.name ?? "",
    debitAccountType: debit?.accountType ?? "expense",
    debitAmount: "",
    debitPartnerName: null,
    debitTaxCategoryId: null,
    debitBusinessCategoryId: null,
    creditLineId: null,
    creditAccountId: credit?.id ?? null,
    creditAccountName: credit?.name ?? "",
    creditAccountType: credit?.accountType ?? "asset",
    creditAmount: "",
    creditPartnerName: null,
    creditTaxCategoryId: null,
    creditBusinessCategoryId: null,
  };
}

export function entryToFormState(
  draft: EntryDraft,
  nextLinePairId: () => string,
): EntryFormState {
  const visualPairs = entryToVisualPairs(draft);
  const pairs = visualPairs.map(({ debit, credit }): EntryLinePair => ({
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
  }));
  const metadata = resolveEntryPairMetadata(
    visualPairs[0] ?? { debit: null, credit: null },
  );
  return {
    date: draft.date,
    description: draft.description,
    partner: metadata.partner,
    businessRateInput: draft.businessRateInput,
    businessRate: draft.businessRate,
    taxCategory: metadata.taxCategory,
    businessCategory: metadata.businessCategory,
    pairs,
  };
}

export function entryFormStateToEntryDraft(
  form: EntryFormState,
  accounts: EntryMasterAccountOption[],
): EntryDraft {
  const lines: EntryLine[] = [];
  for (const pair of form.pairs) {
    if (
      pair.debitAccountName.trim() !== "" &&
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
        partnerName: pair.debitPartnerName ?? form.partner,
        taxCategoryId: pair.debitTaxCategoryId,
        taxCategoryName: form.taxCategory,
        businessCategoryId: pair.debitBusinessCategoryId,
        businessCategoryName: form.businessCategory,
      });
    }
    if (
      pair.creditAccountName.trim() !== "" &&
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
        partnerName: pair.creditPartnerName ?? form.partner,
        taxCategoryId: pair.creditTaxCategoryId,
        taxCategoryName: form.taxCategory,
        businessCategoryId: pair.creditBusinessCategoryId,
        businessCategoryName: form.businessCategory,
      });
    }
  }
  return {
    date: form.date,
    description: form.description,
    businessRateInput: form.businessRateInput,
    businessRate: form.businessRate,
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
