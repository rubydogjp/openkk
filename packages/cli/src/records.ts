import {
  capFixedAssetPreviewDate,
  mapFixedAsset,
  mapOpeningJournalToRecord,
  storedEntryToRecord,
  type EntryLineMaster,
  type EntryRecord,
  type FiscalPeriodReportInput,
} from "@rubydogjp/openkk-client-domain";
import type {
  FiscalPeriodApiRecord,
  OpenkkBackendPort,
} from "@rubydogjp/openkk-client-ports";

export async function loadMaster(
  api: OpenkkBackendPort,
): Promise<EntryLineMaster> {
  const [accounts, taxCategories, businessCategories] = await Promise.all([
    api.masterData.getBookAccounts(),
    api.masterData.getTaxCategories(),
    api.masterData.getBusinessCategories(),
  ]);
  return { accounts, taxCategories, businessCategories };
}

export async function loadEntryRecords(
  api: OpenkkBackendPort,
  fiscalPeriodId: string,
): Promise<EntryRecord[]> {
  const [entries, master] = await Promise.all([
    api.entries.getAll(fiscalPeriodId),
    loadMaster(api),
  ]);
  return entries
    .map((entry) => storedEntryToRecord(entry, fiscalPeriodId, master))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export async function loadFiscalPeriodReportInput(
  api: OpenkkBackendPort,
  fiscalPeriod: FiscalPeriodApiRecord,
  today: Date,
): Promise<FiscalPeriodReportInput> {
  const [entries, master, fixedAssets] = await Promise.all([
    loadEntryRecords(api, fiscalPeriod.id),
    loadMaster(api),
    api.fixedAssets.getAll(fiscalPeriod.id),
  ]);
  const accountNameById = byId(master.accounts, (account) => account.name);
  const accountTypeById = byId(
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
        byId(master.taxCategories, (category) => category.name),
        byId(master.businessCategories, (category) => category.name),
      ),
    ),
  };
}

function byId<T extends { id: string }, V>(
  items: ReadonlyArray<T>,
  value: (item: T) => V,
): Record<string, V> {
  return Object.fromEntries(items.map((item) => [item.id, value(item)]));
}
