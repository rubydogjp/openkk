import {
  AppError,
  BUILT_IN_MASTER_SETS,
  MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE,
  capFixedAssetPreviewDate,
  mapFixedAsset,
  mapOpeningJournalToRecord,
  masterSetName,
  readLegacyFiscalPeriodMasterSetId,
  storedEntryToRecord,
  type EntryRecord,
  type FiscalPeriodReportInput,
  type JournalTableMaster,
} from "../../domain/index.js";
import type {
  FiscalPeriodApiRecord,
  MasterBookAccountApiRecord,
  MasterBusinessCategoryApiRecord,
  MasterSetApiRecord,
  MasterTaxCategoryApiRecord,
  OpenkkBackendPort,
} from "../../ports/index.js";
import { valueById } from "../shared/value-by-id.js";

export type LoadedJournalMaster = {
  accounts: MasterBookAccountApiRecord[];
  otherAccounts: MasterBookAccountApiRecord[];
  taxCategories: MasterTaxCategoryApiRecord[];
  businessCategories: MasterBusinessCategoryApiRecord[];
};

export const EMPTY_JOURNAL_MASTER: LoadedJournalMaster = {
  accounts: [],
  otherAccounts: [],
  taxCategories: [],
  businessCategories: [],
};

const HTTP_NOT_FOUND = 404;
const SINGLE_MASTER_SET_EFFECTIVE_FROM = "2000-01-01";

export async function loadMasterSets(
  backend: OpenkkBackendPort,
): Promise<MasterSetApiRecord[]> {
  try {
    return await backend.masterData.getMasterSets();
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode !== HTTP_NOT_FOUND) {
      throw error;
    }
    const [bookAccounts, taxCategories, businessCategories] = await Promise.all(
      [
        backend.masterData.getBookAccounts(),
        backend.masterData.getTaxCategories(),
        backend.masterData.getBusinessCategories(),
      ],
    );
    return [
      {
        id: MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE,
        name: masterSetName(
          MASTER_SET_ID_OF_RECORDS_WITHOUT_ONE,
          BUILT_IN_MASTER_SETS,
        ),
        effectiveFrom: SINGLE_MASTER_SET_EFFECTIVE_FROM,
        bookAccounts,
        taxCategories,
        businessCategories,
      },
    ];
  }
}

export function journalMasterOfSet(
  masterSets: ReadonlyArray<MasterSetApiRecord>,
  masterSetId: string,
): LoadedJournalMaster {
  const masterSet =
    masterSets.find((candidate) => candidate.id === masterSetId) ??
    masterSets[masterSets.length - 1] ??
    null;
  if (masterSet == null) return EMPTY_JOURNAL_MASTER;
  const inSet = new Set(masterSet.bookAccounts.map((account) => account.id));
  const otherAccounts = new Map<string, MasterBookAccountApiRecord>();
  for (const candidate of masterSets) {
    for (const account of candidate.bookAccounts) {
      if (!inSet.has(account.id)) otherAccounts.set(account.id, account);
    }
  }
  return {
    accounts: masterSet.bookAccounts,
    otherAccounts: [...otherAccounts.values()],
    taxCategories: masterSet.taxCategories,
    businessCategories: masterSet.businessCategories,
  };
}

export async function loadJournalMaster(
  backend: OpenkkBackendPort,
  masterSetId: string,
): Promise<LoadedJournalMaster> {
  return journalMasterOfSet(await loadMasterSets(backend), masterSetId);
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
  const master = await loadJournalMaster(
    backend,
    readLegacyFiscalPeriodMasterSetId(fiscalPeriod),
  );
  const [entries, fixedAssets] = await Promise.all([
    loadEntryRecords(backend, fiscalPeriod.id, master),
    backend.fixedAssets.getAll(fiscalPeriod.id),
  ]);
  const knownAccounts = [...master.otherAccounts, ...master.accounts];
  const accountNameById = valueById(knownAccounts, (account) => account.name);
  const accountTypeById = valueById(
    knownAccounts,
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
