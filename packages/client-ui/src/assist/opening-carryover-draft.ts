import type {
  EntryAccountVisualType,
  OpeningCarryoverRecord,
} from "@rubydogjp/openkk-client-domain";

type AccountOption = {
  id: string;
  name: string;
  accountType: EntryAccountVisualType;
};

export function buildNewOpeningCarryoverDraft(
  fiscalPeriodId: string,
  periodStartDate: string,
  accountOptions: AccountOption[],
): OpeningCarryoverRecord {
  const debit =
    accountOptions.find(
      (account) => account.name === "売掛金" && account.accountType === "asset",
    ) ?? accountOptions.find((account) => account.accountType === "asset");
  const credit =
    accountOptions.find(
      (account) => account.name === "売上" && account.accountType === "revenue",
    ) ?? accountOptions.find((account) => account.accountType === "revenue");
  return {
    id: "__new_opening_carryover__",
    fiscalPeriodId,
    date: periodStartDate,
    description: "期首再振替",
    debit: debit?.name ?? "",
    debitType: debit?.accountType ?? "asset",
    debitAmount: "",
    credit: credit?.name ?? "",
    creditType: credit?.accountType ?? "revenue",
    creditAmount: "",
    partner: "",
    taxCategory: "対象外",
    businessCategory: "対象外",
    businessRate: "100",
    debitBookAccountId: debit?.id ?? null,
    creditBookAccountId: credit?.id ?? null,
    businessRateRatio: null,
    lines: null,
  };
}
