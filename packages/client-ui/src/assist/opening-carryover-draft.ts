import type {
  BookAccountType,
  OpeningCarryoverDraft,
} from "@rubydogjp/openkk-client-domain";

type AccountOption = {
  id: string;
  name: string;
  accountType: BookAccountType;
};

export function buildNewOpeningCarryoverDraft(
  periodStartDate: string,
  accountOptions: AccountOption[],
): OpeningCarryoverDraft {
  const debit =
    accountOptions.find(
      (account) => account.name === "売掛金" && account.accountType === "asset",
    ) ?? accountOptions.find((account) => account.accountType === "asset");
  const credit =
    accountOptions.find(
      (account) => account.name === "売上" && account.accountType === "revenue",
    ) ?? accountOptions.find((account) => account.accountType === "revenue");
  return {
    date: periodStartDate,
    description: "期首再振替",
    businessRateInput: "",
    businessRate: null,
    lines: [
      {
        id: null,
        side: "debit",
        accountName: debit?.name ?? "",
        accountType: debit?.accountType ?? "asset",
        amount: "",
        bookAccountId: debit?.id ?? null,
        partnerName: "",
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: "対象外",
      },
      {
        id: null,
        side: "credit",
        accountName: credit?.name ?? "",
        accountType: credit?.accountType ?? "revenue",
        amount: "",
        bookAccountId: credit?.id ?? null,
        partnerName: "",
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: "対象外",
      },
    ],
  };
}
