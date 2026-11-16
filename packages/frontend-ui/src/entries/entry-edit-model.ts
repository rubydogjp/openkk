import {
  entrySharedLineValues,
  entryToVisualPairs,
  formatBusinessRatePercent,
  parseAmount,
  type BookAccountType,
  type EntryLine,
  type EntryRecord,
} from "@rubydogjp/openkk-driver";
import type {
  EntryDraft,
  EntryMasterAccountOption,
} from "@rubydogjp/openkk-driver";

export type EntryLinePair = {
  id: string;
  debitLineId: string | null;
  debitAccountId: string | null;
  debitAccountName: string;
  debitAccountType: BookAccountType;
  debitAmount: string;
  creditLineId: string | null;
  creditAccountId: string | null;
  creditAccountName: string;
  creditAccountType: BookAccountType;
  creditAmount: string;
};

export type EntryFormState = {
  date: string;
  description: string;
  partner: string;
  businessRateInput: string;
  businessRate: number | null;
  taxCategory: string;
  storedTaxCategoryId: string | null;
  businessCategory: string;
  storedBusinessCategoryId: string | null;
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
    creditLineId: null,
    creditAccountId: credit?.id ?? null,
    creditAccountName: credit?.name ?? "",
    creditAccountType: credit?.accountType ?? "asset",
    creditAmount: "",
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
    creditLineId: credit?.id ?? null,
    creditAccountId: credit?.bookAccountId ?? null,
    creditAccountName: credit?.accountName ?? "",
    creditAccountType: credit?.accountType ?? "asset",
    creditAmount: credit?.amount ?? "",
  }));
  const shared = entrySharedLineValues(draft);
  return {
    date: draft.date,
    description: draft.description,
    partner: shared.partnerName ?? "",
    businessRateInput: draft.businessRateInput,
    businessRate: draft.businessRate,
    taxCategory: shared.taxCategoryName ?? shared.taxCategoryId ?? "",
    storedTaxCategoryId: shared.taxCategoryId,
    businessCategory:
      shared.businessCategoryName ?? shared.businessCategoryId ?? "",
    storedBusinessCategoryId: shared.businessCategoryId,
    pairs,
  };
}

export function entryFormStateToEntryDraft(
  form: EntryFormState,
  accounts: EntryMasterAccountOption[],
): EntryDraft {
  const sharedValues = {
    partnerName: form.partner,
    taxCategoryId: form.storedTaxCategoryId,
    taxCategoryName: form.taxCategory,
    businessCategoryId: form.storedBusinessCategoryId,
    businessCategoryName: form.businessCategory,
  };
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
        ...sharedValues,
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
        ...sharedValues,
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
