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
  parseAmount,
  resolveCategoryId,
  resolveBookAccountId,
  recordToPreviewRows,
  draftBusinessRate,
  weekdayJa,
  type EntryRecord,
  type EntryLine,
  type BookAccountType,
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
  entryRecordToImportPayload,
} from "./import-mapping.js";

import type {
  EntryApiRecord,
  EntryLineInput,
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
  ) => Promise<string | null>;
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
              mapRemoteEntryToRecord({
                entry,
                fiscalPeriodId,
                accounts: bookAccounts,
                taxes: taxCategories,
                businesses: businessCategories,
              }),
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
    bookAccounts,
    businessCategories,
    taxCategories,
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
        assertEditingUnlocked(config.editingPolicy, "entries.createEntryFromDraft");
        const authOperationVersion = appState.captureAuthOperationVersion();
        periodVersions.current.invalidate(fiscalPeriodId);
        const lines = buildEntryApiLinesFromDraft(
          draft,
          {
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          },
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
          const mapped = mapRemoteEntryToRecord({
            entry: created,
            fiscalPeriodId,
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          });
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
        const lines = buildEntryApiLinesFromDraft(
          draft,
          {
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          },
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
                mapRemoteEntryToRecord({
                  entry: updated,
                  fiscalPeriodId: currentRecord.fiscalPeriodId,
                  accounts: bookAccounts,
                  taxes: taxCategories,
                  businesses: businessCategories,
                }),
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
        assertEditingUnlocked(config.editingPolicy, "entries.mergeFiscalPeriodEntries");
        const authOperationVersion = appState.captureAuthOperationVersion();
        periodVersions.current.invalidate(fiscalPeriodId);
        const payload = importedEntries.map((entry) =>
          entryRecordToImportPayload(entry, {
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          }),
        );
        try {
          const response = await backendApi.entries.importMany(
            fiscalPeriodId,
            payload,
          );
          appState.assertAuthOperationCurrent(authOperationVersion);
          const appended = response.entries.map((entry) =>
            mapRemoteEntryToRecord({
              entry,
              fiscalPeriodId,
              accounts: bookAccounts,
              taxes: taxCategories,
              businesses: businessCategories,
            }),
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
          entryRecordToImportPayload(entry, {
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          }),
        );
      },
      accountOptions,
      taxCategoryOptions,
      businessCategoryOptions,
      listSuggestions(fiscalPeriodId) {
        const partner = new Set<string>();
        const tax = new Set<string>();
        const biz = new Set<string>();
        for (const record of records) {
          if (record.fiscalPeriodId !== fiscalPeriodId) continue;
          for (const line of record.lines) {
            addSuggestion(partner, line.partnerName, null);
            addSuggestion(tax, line.taxCategoryName, line.taxCategoryId);
            addSuggestion(
              biz,
              line.businessCategoryName,
              line.businessCategoryId,
            );
          }
        }
        return {
          partner: Array.from(partner).sort(),
          taxCategory: Array.from(tax).sort(),
          businessCategory: Array.from(biz).sort(),
        };
      },
      loadError,
      reload() {
        setReloadNonce((nonce) => nonce + 1);
      },
      async reloadAndWait() {
        const authOperationVersion = appState.captureAuthOperationVersion();
        const fiscalPeriodId = appState.currentFiscalPeriodId;
        if (fiscalPeriodId == null) {
          setRecords([]);
          setEntriesLoadError(null);
          return [];
        }
        if (currentFiscalPeriodDataPurged) {
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
              mapRemoteEntryToRecord({
                entry,
                fiscalPeriodId,
                accounts: bookAccounts,
                taxes: taxCategories,
                businesses: businessCategories,
              }),
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

function mapRemoteEntryToRecord(input: {
  entry: EntryApiRecord;
  fiscalPeriodId: string;
  accounts: MasterBookAccountApiRecord[];
  taxes: MasterTaxCategoryApiRecord[];
  businesses: MasterBusinessCategoryApiRecord[];
}): EntryRecord {
  const lines: EntryLine[] = input.entry.lines.map((line): EntryLine => ({
    side: line.side,
    accountName: mapBookAccountName(line.bookAccountId, input.accounts),
    accountType: mapAccountType(line.bookAccountId, input.accounts, "asset"),
    amount: formatAmount(Math.abs(line.amount)),
    bookAccountId: line.bookAccountId,
    partnerName: line.partnerName,
    taxCategoryId: line.taxCategoryId,
    taxCategoryName: mapCategoryName(line.taxCategoryId, input.taxes),
    businessCategoryId: line.businessCategoryId,
    businessCategoryName: mapCategoryName(
      line.businessCategoryId,
      input.businesses,
    ),
    id: null,
  }));
  const date = input.entry.date;
  return {
    id: input.entry.id,
    fiscalPeriodId: input.fiscalPeriodId,
    date,
    weekday: weekdayJa(date),
    lines,
    description: input.entry.description,
    businessRate: input.entry.businessRate,
    localId: input.entry.localId,
  };
}

function mapBookAccountName(
  id: string,
  accounts: MasterBookAccountApiRecord[],
): string {
  return accounts.find((account) => account.id === id)?.name ?? id;
}

function mapCategoryName(
  id: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string {
  if (id.length === 0) return "対象外";
  return categories.find((category) => category.id === id)?.name ?? id;
}

function mapAccountType(
  id: string,
  accounts: MasterBookAccountApiRecord[],
  fallback: BookAccountType,
): BookAccountType {
  return (accounts.find((account) => account.id === id)?.accountType ??
    fallback) as BookAccountType;
}

function buildEntryApiLinesFromDraft(
  draft: EntryDraft,
  master: {
    accounts: MasterBookAccountApiRecord[];
    taxes: MasterTaxCategoryApiRecord[];
    businesses: MasterBusinessCategoryApiRecord[];
  },
  errorContext: { messageForDeveloper: string; messageForUser: string },
): EntryLineInput[] {
  return draft.lines.map((line) => {
    const bookAccountId = resolveBookAccountId({
      explicitId: line.bookAccountId,
      accountName: line.accountName,
      accountType: line.accountType,
      accounts: master.accounts,
    });
    if (bookAccountId == null) {
      throw new AppError({
        messageForDeveloper: errorContext.messageForDeveloper,
        messageForUser: errorContext.messageForUser,
        originalMessage: null,
        statusCode: null,
        code: null,
      });
    }
    return {
      side: line.side,
      bookAccountId,
      amount: parseAmount(line.amount),
      partnerName: line.partnerName ?? "",
      taxCategoryId: resolveCategoryId(
        line.taxCategoryId,
        line.taxCategoryName ?? "",
        master.taxes,
        "tax_out_of_scope",
      ),
      businessCategoryId: resolveCategoryId(
        line.businessCategoryId,
        line.businessCategoryName ?? "",
        master.businesses,
        "biz_none",
      ),
    };
  });
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
