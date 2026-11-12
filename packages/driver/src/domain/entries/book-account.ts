export type BookAccountType =
  "asset" | "liability" | "equity" | "revenue" | "cost_of_sales" | "expense";

export type BookAccount = {
  id: string;
  name: string;
  accountType: BookAccountType;
};

export type BookAccountBalanceSheetSection =
  | "current_asset"
  | "fixed_asset"
  | "deferred_asset"
  | "current_liability"
  | "long_term_liability"
  | "equity"
  | "none";

export type SectionedBookAccount = BookAccount & {
  balanceSheetSection: BookAccountBalanceSheetSection;
};

export const BALANCE_SHEET_SECTION_LABELS: Record<
  BookAccountBalanceSheetSection,
  string
> = {
  current_asset: "流動資産",
  fixed_asset: "固定資産",
  deferred_asset: "繰延資産",
  current_liability: "流動負債",
  long_term_liability: "固定負債",
  equity: "純資産",
  none: "",
};

const BOOK_ACCOUNT_TYPE_LABELS: Record<BookAccountType, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  cost_of_sales: "売上原価",
  expense: "経費",
};

export function buildBookAccountLabels(
  accounts: ReadonlyArray<SectionedBookAccount>,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const account of accounts) {
    const sameName = accounts.filter(
      (candidate) => candidate.name === account.name,
    );
    const qualifiers: string[] = [];
    if (
      account.accountType !== "expense" &&
      sameName.some(
        (candidate) => candidate.accountType !== account.accountType,
      )
    ) {
      qualifiers.push(BOOK_ACCOUNT_TYPE_LABELS[account.accountType]);
    }
    const sameType = sameName.filter(
      (candidate) => candidate.accountType === account.accountType,
    );
    if (sameType.length > 1) {
      const sectionLabel =
        BALANCE_SHEET_SECTION_LABELS[account.balanceSheetSection];
      const sameSection = sameType.filter(
        (candidate) =>
          candidate.balanceSheetSection === account.balanceSheetSection,
      );
      qualifiers.push(
        sectionLabel !== "" && sameSection.length === 1
          ? sectionLabel
          : account.id,
      );
    }
    labels.set(
      account.id,
      qualifiers.length === 0
        ? account.name
        : `${account.name}（${qualifiers.join("・")}）`,
    );
  }
  return labels;
}

export function resolveBookAccountId(input: {
  explicitId: string | null;
  accountName: string;
  accountType: BookAccountType | null;
  accounts: ReadonlyArray<BookAccount>;
}): string | null {
  const id = input.explicitId?.trim() ?? "";
  if (id !== "") {
    return input.accounts.find((account) => account.id === id)?.id ?? null;
  }
  const name = input.accountName.trim();
  const matches = input.accounts.filter(
    (account) =>
      account.name === name &&
      (input.accountType == null || account.accountType === input.accountType),
  );
  return matches.length === 1 ? matches[0]!.id : null;
}
