import {
  capFixedAssetPreviewDate,
  mapFixedAsset,
  mapOpeningJournalToRecord,
  storedEntryToRecord,
  type EntryRecord,
  type FiscalPeriodReportInput,
  type JournalTableMaster,
} from "../../domain/index.js";
import type {
  FiscalPeriodApiRecord,
  MasterBookAccountApiRecord,
  MasterBusinessCategoryApiRecord,
  MasterTaxCategoryApiRecord,
  OpenkkBackendPort,
} from "../../ports/index.js";
import { valueById } from "../shared/value-by-id.js";

export type LoadedJournalMaster = {
  accounts: MasterBookAccountApiRecord[];
  taxCategories: MasterTaxCategoryApiRecord[];
  businessCategories: MasterBusinessCategoryApiRecord[];
};

export async function loadJournalMaster(
  backend: OpenkkBackendPort,
): Promise<LoadedJournalMaster> {
  const [accounts, taxCategories, businessCategories] = await Promise.all([
    backend.masterData.getBookAccounts(),
    backend.masterData.getTaxCategories(),
    backend.masterData.getBusinessCategories(),
  ]);
  return { accounts, taxCategories, businessCategories };
}

export async function loadEntryRecords(
  backend: OpenkkBackendPort,
  fiscalPeriodId: string,
  master: JournalTableMaster,
): Promise<EntryRecord[]> {
  const entries = await backend.entries.getAll(fiscalPeriodId);
  return entries
    .map((entry) => storedEntryToRecord(entry, fiscalPeriodId, master))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function loadFiscalPeriodReportInput(
  backend: OpenkkBackendPort,
  fiscalPeriod: FiscalPeriodApiRecord,
  today: Date,
): Promise<FiscalPeriodReportInput> {
  const master = await loadJournalMaster(backend);
  const [entries, fixedAssets] = await Promise.all([
    loadEntryRecords(backend, fiscalPeriod.id, master),
    backend.fixedAssets.getAll(fiscalPeriod.id),
  ]);
  const accountNameById = valueById(master.accounts, (account) => account.name);
  const accountTypeById = valueById(
    master.accounts,
    (account) => account.accountType,
  );
  const previewAsOf = capFixedAssetPreviewDate(today, fiscalPeriod.endDate);
  return {
    fiscalPeriod,
    entries,
    assets: fixedAssets.map((asset) =>
      mapFixedAsset(
        asset,
        accountNameById[asset.bookAccountId] ?? null,
        previewAsOf,
        fiscalPeriod.endDate,
      ),
    ),
    carryovers: fiscalPeriod.opening.journals.map((journal) =>
      mapOpeningJournalToRecord(
        journal,
        fiscalPeriod.id,
        accountNameById,
        accountTypeById,
        valueById(master.taxCategories, (category) => category.name),
        valueById(master.businessCategories, (category) => category.name),
      ),
    ),
  };
}
