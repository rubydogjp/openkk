import { CliUsageError } from "./cli-io.js";

const COST_OF_SALES_ACCOUNT_TYPE = "cost_of_sales";

export function requireAccountByExactName<
  T extends { name: string; accountType: string },
>(accountName: string, accounts: ReadonlyArray<T>): T {
  const name = accountName.trim();
  const matches = accounts.filter((account) => account.name === name);
  const account =
    matches.find((match) => match.accountType !== COST_OF_SALES_ACCOUNT_TYPE) ??
    matches[0];
  if (account == null) {
    throw new CliUsageError(`勘定科目「${accountName}」が見つかりません`);
  }
  return account;
}
