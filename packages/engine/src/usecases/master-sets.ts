import { MASTER_SETS } from "../domain/index.js";
import type {
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
} from "../ports/index.js";

export type MasterSetRecord = {
  id: string;
  name: string;
  effectiveFrom: string;
  bookAccounts: MasterBookAccountDbRecord[];
  taxCategories: MasterTaxCategoryDbRecord[];
  businessCategories: MasterBusinessCategoryDbRecord[];
};

const MASTER_RECORD_TIMESTAMP = new Date(0).toISOString();

export function masterSetRecords(): MasterSetRecord[] {
  return MASTER_SETS.map((masterSet) => ({
    id: masterSet.id,
    name: masterSet.name,
    effectiveFrom: masterSet.effectiveFrom,
    bookAccounts: masterSet.bookAccounts.map((account) => ({
      ...account,
      createdAt: MASTER_RECORD_TIMESTAMP,
      updatedAt: MASTER_RECORD_TIMESTAMP,
    })),
    taxCategories: masterSet.taxCategories.map((category) => ({
      ...category,
      createdAt: MASTER_RECORD_TIMESTAMP,
      updatedAt: MASTER_RECORD_TIMESTAMP,
    })),
    businessCategories: masterSet.businessCategories.map((category) => ({
      ...category,
      createdAt: MASTER_RECORD_TIMESTAMP,
      updatedAt: MASTER_RECORD_TIMESTAMP,
    })),
  }));
}
