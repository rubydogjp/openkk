import {
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
} from "./generated-master-data.js";

export * from "./generated-master-data.js";

const DEFAULT_BOOK_ACCOUNT_BY_ID = new Map(
  DEFAULT_BOOK_ACCOUNTS.map((account) => [account.id, account]),
);
const DEFAULT_TAX_CATEGORY_IDS = new Set(
  DEFAULT_TAX_CATEGORIES.map((category) => category.id),
);
const DEFAULT_BUSINESS_CATEGORY_IDS = new Set(
  DEFAULT_BUSINESS_CATEGORIES.map((category) => category.id),
);

export function getDefaultBookAccount(id: string) {
  return DEFAULT_BOOK_ACCOUNT_BY_ID.get(id) ?? null;
}

export function isDefaultTaxCategoryId(id: string): boolean {
  return DEFAULT_TAX_CATEGORY_IDS.has(id);
}

export function isDefaultBusinessCategoryId(id: string): boolean {
  return DEFAULT_BUSINESS_CATEGORY_IDS.has(id);
}
