import {
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
} from "@rubydogjp/openkk-server-domain";

import type {
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterDataDb,
  MasterTaxCategoryDbRecord,
} from "@rubydogjp/openkk-server-ports";
import { msToIso } from "./persistence-codec.js";

const MASTER_RECORD_TIMESTAMP = msToIso(0);

export function createMasterDataDb(): MasterDataDb {
  return {
    async getBookAccounts() {
      return DEFAULT_BOOK_ACCOUNTS.map(
        (account): MasterBookAccountDbRecord => ({
          id: account.id,
          name: account.name,
          description: account.description,
          kana: account.kana,
          normalBalanceSide: account.normalBalanceSide,
          accountType: account.accountType,
          balanceSheetSection: account.balanceSheetSection,
          sortOrder: account.sortOrder,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
    async getTaxCategories() {
      return DEFAULT_TAX_CATEGORIES.map(
        (category): MasterTaxCategoryDbRecord => ({
          id: category.id,
          name: category.name,
          rate: category.rate,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
    async getBusinessCategories() {
      return DEFAULT_BUSINESS_CATEGORIES.map(
        (category): MasterBusinessCategoryDbRecord => ({
          id: category.id,
          name: category.name,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
  };
}
