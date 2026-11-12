import { DEFAULT_BOOK_ACCOUNTS } from "./generated-master-data.js";

export * from "./generated-master-data.js";

const DEFAULT_BOOK_ACCOUNT_BY_ID = new Map(
  DEFAULT_BOOK_ACCOUNTS.map((account) => [account.id, account]),
);

export function getDefaultBookAccount(id: string) {
  return DEFAULT_BOOK_ACCOUNT_BY_ID.get(id) ?? null;
}
