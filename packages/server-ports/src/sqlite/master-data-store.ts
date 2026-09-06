import {
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
} from "@rubydogjp/openkk-server-domain";

import type { MasterDataDb } from "../db-adapter.js";
import type {
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
} from "../persistence-types.js";
import { msToIso } from "./persistence-codec.js";

const MASTER_RECORD_TIMESTAMP = msToIso(0);

export function createMasterDataDb(): MasterDataDb {
  return {
    async getAllBookAccounts() {
      return DEFAULT_BOOK_ACCOUNTS.map(
        (a): MasterBookAccountDbRecord => ({
          id: a.id,
          name: a.name,
          description: a.description,
          kana: a.kana,
          normalBalanceSide: a.normalBalanceSide,
          accountType: a.accountType,
          balanceSheetSection: a.balanceSheetSection,
          sortOrder: a.sortOrder,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
    async getAllTaxCategories() {
      return DEFAULT_TAX_CATEGORIES.map(
        (c): MasterTaxCategoryDbRecord => ({
          id: c.id,
          name: c.name,
          rate: c.rate,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
    async getAllBusinessCategories() {
      return DEFAULT_BUSINESS_CATEGORIES.map(
        (c): MasterBusinessCategoryDbRecord => ({
          id: c.id,
          name: c.name,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
  };
}
