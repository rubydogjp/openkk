export type BookAccountType =
  "asset" | "liability" | "equity" | "revenue" | "cost_of_sales" | "expense";

export type BookAccount = {
  id: string;
  name: string;
  accountType: BookAccountType;
};

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
