"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AppError,
  formatAmount,
  recordToPreviewRows,
  draftBusinessRate,
  weekdayJa,
  type EntryRecord,
  type EntryLine,
  type EntryPreviewRow,
} from "@rubydogjp/openkk-client-domain";
import { useOpenkkAppState } from "../shared/openkk-app-state.js";
import { useBackendApi } from "../shared/backend-api-context.js";
import { useOpenkkConfig } from "../shared/openkk-config-context.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";
import { isSelectedFiscalPeriodDataPurged } from "../shared/archive-data-policy.js";
import { KeyedAsyncStateVersion } from "../shared/async-state-version.js";
import { KeyedAsyncMutationQueue } from "../shared/async-mutation-queue.js";
import {
  buildEntryMasterAccountOptions,
  type EntryMasterAccountOption,
} from "./account-options.js";
import {
  earliestEntryDate,
  removeEntryRecord,
  replaceFiscalPeriodEntryRecords,
  upsertEntryRecord,
} from "./entry-record-state.js";
import {
  entryLinesToInputs,
  entryRecordToImportPayload,
  type EntryLineMaster,
} from "./import-mapping.js";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  MasterBookAccountApiRecord,
  MasterBusinessCategoryApiRecord,
  MasterTaxCategoryApiRecord,
} from "@rubydogjp/openkk-client-ports";

export type EntryDraft = {
  date: string;
  description: string;
  businessRateInput: string;
  businessRate: number | null;
  lines: EntryLine[];
};

export type { EntryMasterAccountOption } from "./account-options.js";

export type EntryMasterCategoryOption = { id: string; name: string };

export type EntrySuggestions = {
  partner: string[];
  taxCategory: string[];
  businessCategory: string[];
};

type EntriesState = {
  listFiscalPeriodEntries: (fiscalPeriodId: string) => EntryRecord[];
  listMonthEntries: (
    fiscalPeriodId: string,
    yearMonth: string,
  ) => EntryRecord[];
  listMonthRows: (
    fiscalPeriodId: string,
    yearMonth: string,
  ) => EntryPreviewRow[];
  getEntry: (entryId: string) => EntryRecord | null;
  createEntryFromDraft: (
    fiscalPeriodId: string,
    draft: EntryDraft,
  ) => Promise<string>;
  saveEntry: (entryId: string, draft: EntryDraft) => Promise<boolean>;
  deleteEntry: (entryId: string) => Promise<boolean>;
  mergeFiscalPeriodEntries: (
    fiscalPeriodId: string,
    importedEntries: EntryRecord[],
  ) => Promise<{
    imported: number;
    skipped: number;
    earliestImportedDate: string | null;
  }>;
  prepareFiscalPeriodEntries: (
    importedEntries: EntryRecord[],
  ) => EntryUpsertInput[];

  accountOptions: EntryMasterAccountOption[];
  taxCategoryOptions: EntryMasterCategoryOption[];
  businessCategoryOptions: EntryMasterCategoryOption[];

  listSuggestions: (fiscalPeriodId: string) => EntrySuggestions;

  loadError: unknown;
  reload: () => void;
  reloadAndWait: () => Promise<EntryRecord[]>;
};

const EntriesContext = createContext<EntriesState | null>(null);

export function OpenkkEntriesProvider(props: { children: ReactNode }) {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  const config = useOpenkkConfig();

  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [bookAccounts, setBookAccounts] = useState<
    MasterBookAccountApiRecord[]
  >([]);
  const [taxCategories, setTaxCategories] = useState<
    MasterTaxCategoryApiRecord[]
  >([]);
  const [businessCategories, setBusinessCategories] = useState<
    MasterBusinessCategoryApiRecord[]
  >([]);
  const [masterLoadError, setMasterLoadError] = useState<unknown>(null);
  const [entriesLoadError, setEntriesLoadError] = useState<unknown>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const sessionUserId = appState.session?.user.id ?? null;
  const periodVersions = useRef(new KeyedAsyncStateVersion<string>());
  const entryMutationQueue = useRef(new KeyedAsyncMutationQueue<string>());
  const currentFiscalPeriodDataPurged = isSelectedFiscalPeriodDataPurged(
    appState.fiscalPeriods,
    appState.currentFiscalPeriodId,
  );
  const master = useMemo<EntryLineMaster>(
    () => ({ accounts: bookAccounts, taxCategories, businessCategories }),
    [bookAccounts, taxCategories, businessCategories],
  );

  useEffect(() => {
    if (sessionUserId == null) {
      setMasterLoadError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [accounts, taxes, businesses] = await Promise.all([
          backendApi.masterData.getBookAccounts(),
          backendApi.masterData.getTaxCategories(),
          backendApi.masterData.getBusinessCategories(),
        ]);
        if (cancelled) return;
        setBookAccounts(accounts);
        setTaxCategories(taxes);
        setBusinessCategories(businesses);
        setMasterLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] master data load failed:", error);
        setMasterLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce, sessionUserId]);

  useEffect(() => {
    const fiscalPeriodId = appState.currentFiscalPeriodId;
    if (
      fiscalPeriodId == null ||
      fiscalPeriodId.length === 0 ||
      currentFiscalPeriodDataPurged
    ) {
      setRecords([]);
      setEntriesLoadError(null);
      return;
    }
    let cancelled = false;
    const authOperationVersion = appState.captureAuthOperationVersion();
    const readVersion = periodVersions.current.capture(fiscalPeriodId);
    void (async () => {
      try {
        const remoteEntries = await backendApi.entries.getAll(fiscalPeriodId);
        if (
          cancelled ||
          !appState.isAuthOperationCurrent(authOperationVersion) ||
          !periodVersions.current.isCurrent(fiscalPeriodId, readVersion)
        ) {
          return;
        }
        setRecords((current) =>
          replaceFiscalPeriodEntryRecords(
            current,
            fiscalPeriodId,
            remoteEntries.map((entry) =>
              mapRemoteEntryToRecord(entry, fiscalPeriodId, master),
            ),
          ),
        );
        setEntriesLoadError(null);
      } catch (error) {
        if (
          cancelled ||
          !appState.isAuthOperationCurrent(authOperationVersion) ||
          !periodVersions.current.isCurrent(fiscalPeriodId, readVersion)
        ) {
          return;
        }
        console.error("[openkk] entries load failed:", error);
        setEntriesLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    appState.currentFiscalPeriodId,
    master,
    currentFiscalPeriodDataPurged,
    reloadNonce,
  ]);

  const value = useMemo<EntriesState>(() => {
    const loadError = masterLoadError ?? entriesLoadError;
    const accountOptions = buildEntryMasterAccountOptions(bookAccounts);
    const taxCategoryOptions: EntryMasterCategoryOption[] = taxCategories.map(
      (category) => ({ id: category.id, name: category.name }),
    );
    const businessCategoryOptions: EntryMasterCategoryOption[] =
      businessCategories.map((category) => ({
        id: category.id,
        name: category.name,
      }));

    const listMonthEntries = (fiscalPeriodId: string, yearMonth: string) =>
      records
        .filter(
          (record) =>
            record.fiscalPeriodId === fiscalPeriodId &&
            record.date.startsWith(yearMonth),
        )
        .sort((left, right) => left.date.localeCompare(right.date));

    return {
      listFiscalPeriodEntries(fiscalPeriodId) {
        return records
          .filter((record) => record.fiscalPeriodId === fiscalPeriodId)
          .sort((left, right) => left.date.localeCompare(right.date));
      },
      listMonthEntries,
      listMonthRows(fiscalPeriodId, yearMonth) {
        return listMonthEntries(fiscalPeriodId, yearMonth).flatMap(
          recordToPreviewRows,
        );
      },
      getEntry(entryId) {
        return records.find((record) => record.id === entryId) ?? null;
      },
      async createEntryFromDraft(fiscalPeriodId, draft) {
        assertEditingUnlocked(
          config.editingPolicy,
          "entries.createEntryFromDraft",
        );
        const authOperationVersion = appState.captureAuthOperationVersion();
        periodVersions.current.invalidate(fiscalPeriodId);
        const lines = entryLinesToInputs(
          draft.lines,
          master,
          {
            messageForDeveloper:
              "entries.createEntryFromDraft: bookAccountId resolution failed",
            messageForUser: "勘定科目の解決に失敗したため作成できませんでした",
          },
        );
        try {
          const created = await backendApi.entries.create(fiscalPeriodId, {
            date: draft.date,
            description: draft.description,
            businessRate: draftBusinessRate(draft),
            lines,
            localId: null,
          });
          appState.assertAuthOperationCurrent(authOperationVersion);
          const mapped = mapRemoteEntryToRecord(
            created,
            fiscalPeriodId,
            master,
          );
          setRecords((current) => upsertEntryRecord(current, mapped));
          return mapped.id;
        } finally {
          periodVersions.current.invalidate(fiscalPeriodId);
        }
      },
      async saveEntry(entryId, draft) {
        assertEditingUnlocked(config.editingPolicy, "entries.saveEntry");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const currentRecord = records.find((record) => record.id === entryId);
        if (currentRecord == null) {
          return false;
        }
        const lines = entryLinesToInputs(
          draft.lines,
          master,
          {
            messageForDeveloper:
              "entries.saveEntry: bookAccountId resolution failed",
            messageForUser: "勘定科目の解決に失敗したため保存できませんでした",
          },
        );
        return await entryMutationQueue.current.run(entryId, async () => {
          appState.assertAuthOperationCurrent(authOperationVersion);
          periodVersions.current.invalidate(currentRecord.fiscalPeriodId);
          try {
            const updated = await backendApi.entries.update(
              currentRecord.fiscalPeriodId,
              entryId,
              {
                date: draft.date,
                description: draft.description,
                localId: currentRecord.localId,
                businessRate: draftBusinessRate(draft),
                lines,
              },
            );
            appState.assertAuthOperationCurrent(authOperationVersion);
            setRecords((current) =>
              upsertEntryRecord(
                current,
                mapRemoteEntryToRecord(
                  updated,
                  currentRecord.fiscalPeriodId,
                  master,
                ),
              ),
            );
            return true;
          } finally {
            periodVersions.current.invalidate(currentRecord.fiscalPeriodId);
          }
        });
      },
      async deleteEntry(entryId) {
        assertEditingUnlocked(config.editingPolicy, "entries.deleteEntry");
        const authOperationVersion = appState.captureAuthOperationVersion();
        const currentRecord = records.find((record) => record.id === entryId);
        if (currentRecord == null) {
          return false;
        }
        return await entryMutationQueue.current.run(entryId, async () => {
          appState.assertAuthOperationCurrent(authOperationVersion);
          periodVersions.current.invalidate(currentRecord.fiscalPeriodId);
          try {
            await backendApi.entries.remove(currentRecord.fiscalPeriodId, entryId);
            appState.assertAuthOperationCurrent(authOperationVersion);
            setRecords((current) => removeEntryRecord(current, entryId));
            return true;
          } finally {
            periodVersions.current.invalidate(currentRecord.fiscalPeriodId);
          }
        });
      },
      async mergeFiscalPeriodEntries(fiscalPeriodId, importedEntries) {
        assertEditingUnlocked(
          config.editingPolicy,
          "entries.mergeFiscalPeriodEntries",
        );
        const authOperationVersion = appState.captureAuthOperationVersion();
        periodVersions.current.invalidate(fiscalPeriodId);
        const payload = importedEntries.map((entry) =>
          entryRecordToImportPayload(entry, master),
        );
        try {
          const response = await backendApi.entries.importMany(
            fiscalPeriodId,
            payload,
          );
          appState.assertAuthOperationCurrent(authOperationVersion);
          const appended = response.entries.map((entry) =>
            mapRemoteEntryToRecord(entry, fiscalPeriodId, master),
          );
          setRecords((current) =>
            appended.reduce(upsertEntryRecord, current),
          );
          return {
            imported: response.importedCount,
            skipped: Math.max(
              0,
              importedEntries.length - response.importedCount,
            ),
            earliestImportedDate: earliestEntryDate(appended),
          };
        } finally {
          periodVersions.current.invalidate(fiscalPeriodId);
        }
      },
      prepareFiscalPeriodEntries(importedEntries) {
        return importedEntries.map((entry) =>
          entryRecordToImportPayload(entry, master),
        );
      },
      accountOptions,
      taxCategoryOptions,
      businessCategoryOptions,
      listSuggestions(fiscalPeriodId) {
        const partner = new Set<string>();
        const taxCategory = new Set<string>();
        const businessCategory = new Set<string>();
        for (const record of records) {
          if (record.fiscalPeriodId !== fiscalPeriodId) continue;
          for (const line of record.lines) {
            addSuggestion(partner, line.partnerName, null);
            addSuggestion(
              taxCategory,
              line.taxCategoryName,
              line.taxCategoryId,
            );
            addSuggestion(
              businessCategory,
              line.businessCategoryName,
              line.businessCategoryId,
            );
          }
        }
        return {
          partner: Array.from(partner).sort(),
          taxCategory: Array.from(taxCategory).sort(),
          businessCategory: Array.from(businessCategory).sort(),
        };
      },
      loadError,
      reload() {
        setReloadNonce((nonce) => nonce + 1);
      },
      async reloadAndWait() {
        const authOperationVersion = appState.captureAuthOperationVersion();
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null || currentFiscalPeriodDataPurged) {
          setRecords([]);
          setEntriesLoadError(null);
          return [];
        }
        try {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const readVersion = periodVersions.current.capture(fiscalPeriodId);
            const remoteEntries = await backendApi.entries.getAll(fiscalPeriodId);
            appState.assertAuthOperationCurrent(authOperationVersion);
            if (!periodVersions.current.isCurrent(fiscalPeriodId, readVersion)) {
              continue;
            }
            const mappedEntries = remoteEntries.map((entry) =>
              mapRemoteEntryToRecord(entry, fiscalPeriodId, master),
            );
            setRecords((current) =>
              replaceFiscalPeriodEntryRecords(
                current,
                fiscalPeriodId,
                mappedEntries,
              ),
            );
            setEntriesLoadError(null);
            return mappedEntries;
          }
          throw new AppError({
            messageForDeveloper:
              "entries.reloadAndWait: entries changed during three reads",
            messageForUser:
              "仕訳が同時に更新されたため読み込み直せませんでした。もう一度お試しください",
            originalMessage: null,
            statusCode: null,
            code: null,
          });
        } catch (error) {
          if (!appState.isAuthOperationCurrent(authOperationVersion)) throw error;
          setEntriesLoadError(error);
          throw error;
        }
      },
    };
  }, [
    appState.currentFiscalPeriodId,
    backendApi,
    bookAccounts,
    businessCategories,
    config,
    currentFiscalPeriodDataPurged,
    entriesLoadError,
    master,
    masterLoadError,
    records,
    taxCategories,
  ]);

  return (
    <EntriesContext.Provider value={value}>
      {props.children}
    </EntriesContext.Provider>
  );
}

function mapRemoteEntryToRecord(
  entry: EntryApiRecord,
  fiscalPeriodId: string,
  master: EntryLineMaster,
): EntryRecord {
  const lines = entry.lines.map((line): EntryLine => {
    const account = master.accounts.find(
      (candidate) => candidate.id === line.bookAccountId,
    );
    return {
      side: line.side,
      accountName: account?.name ?? line.bookAccountId,
      accountType: account?.accountType ?? "asset",
      amount: formatAmount(Math.abs(line.amount)),
      bookAccountId: line.bookAccountId,
      partnerName: line.partnerName,
      taxCategoryId: line.taxCategoryId,
      taxCategoryName: mapCategoryName(
        line.taxCategoryId,
        master.taxCategories,
      ),
      businessCategoryId: line.businessCategoryId,
      businessCategoryName: mapCategoryName(
        line.businessCategoryId,
        master.businessCategories,
      ),
      id: null,
    };
  });
  return {
    id: entry.id,
    fiscalPeriodId,
    date: entry.date,
    weekday: weekdayJa(entry.date),
    lines,
    description: entry.description,
    businessRate: entry.businessRate,
    localId: entry.localId,
  };
}

function mapCategoryName(
  id: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (id.length === 0) return "対象外";
  return categories.find((category) => category.id === id)?.name ?? id;
}

function addSuggestion(
  suggestions: Set<string>,
  preferred: string | null,
  fallback: string | null,
): void {
  const value = preferred ?? fallback;
  if (value == null) return;
  const trimmed = value.trim();
  if (trimmed !== "") suggestions.add(trimmed);
}

export function useOpenkkEntries() {
  const value = useContext(EntriesContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper:
        "useOpenkkEntries must be used within OpenkkEntriesProvider",
      messageForUser: "仕訳データを読み込めませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return value;
}
