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

import { AppError } from "@rubydogjp/openkk-client-domain";
import { useOpenkkAppState } from "../shared/openkk-app-state.js";
import { useBackendApi } from "../shared/backend-api-context.js";
import { useOpenkkConfig } from "../shared/openkk-config-context.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";
import { isSelectedFiscalPeriodDataPurged } from "../shared/archive-data-policy.js";
import { AsyncStateVersion } from "../shared/async-state-version.js";
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
  optionalEntryLocalId,
  resolveBookAccountId,
  resolveBusinessCategoryId,
  resolveTaxCategoryId,
} from "./import-mapping.js";

import type {
  EntryApiRecord,
  EntryApiLineInput,
  EntryUpsertInput,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "@rubydogjp/openkk-client-ports";

import {
  parseAmount,
  formatBusinessRatePercent,
  recordToPreviewRows,
  resolveEntryBusinessRate,
  weekdayJa,
  type EntryRecord,
  type EntryLine,
} from "@rubydogjp/openkk-client-domain";
import type { EntryPreviewRow } from "@rubydogjp/openkk-client-domain";

export type EntryDraft = {
  date: string;
  description: string;
  partner: string;
  businessRate: string;
  businessRateRatio: number | null;
  taxCategory: string;
  businessCategory: string;
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
  const [bookAccounts, setBookAccounts] = useState<MasterBookAccount[]>([]);
  const [taxCategories, setTaxCategories] = useState<MasterTaxCategory[]>([]);
  const [businessCategories, setBusinessCategories] = useState<
    MasterBusinessCategory[]
  >([]);
  const [masterLoadError, setMasterLoadError] = useState<unknown>(null);
  const [entriesLoadError, setEntriesLoadError] = useState<unknown>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const periodVersions = useRef(new AsyncStateVersion<string>());
  const entryMutationQueue = useRef(new KeyedAsyncMutationQueue<string>());
  const currentFiscalPeriodDataPurged = isSelectedFiscalPeriodDataPurged(
    appState.fiscalPeriods,
    appState.currentFiscalPeriodId,
  );

  useEffect(() => {
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
  }, [reloadNonce]);

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

    return {
      listFiscalPeriodEntries(fiscalPeriodId) {
        return records
          .filter((record) => record.fiscalPeriodId === fiscalPeriodId)
          .sort((left, right) => left.date.localeCompare(right.date));
      },
      listMonthEntries(fiscalPeriodId, yearMonth) {
        return records
          .filter(
            (record) =>
              record.fiscalPeriodId === fiscalPeriodId &&
              record.date.startsWith(yearMonth),
          )
          .sort((left, right) => left.date.localeCompare(right.date));
      },
      listMonthRows(fiscalPeriodId, yearMonth) {
        return records
          .filter(
            (record) =>
              record.fiscalPeriodId === fiscalPeriodId &&
              record.date.startsWith(yearMonth),
          )
          .sort((left, right) => left.date.localeCompare(right.date))
          .flatMap(recordToPreviewRows);
      },
      getEntry(entryId) {
        return records.find((record) => record.id === entryId) ?? null;
      },
      async createEntryFromDraft(fiscalPeriodId, draft) {
        assertEditingUnlocked(config, "entries.createEntryFromDraft");
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
            businessRate: resolveEntryBusinessRate(draft),
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
        assertEditingUnlocked(config, "entries.saveEntry");
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
            const patched = await backendApi.entries.patch(
              currentRecord.fiscalPeriodId,
              entryId,
              {
                date: draft.date,
                description: draft.description,
                localId: optionalEntryLocalId(currentRecord.localId),
                businessRate: resolveEntryBusinessRate(draft),
                lines,
              },
            );
            appState.assertAuthOperationCurrent(authOperationVersion);
            setRecords((current) =>
              upsertEntryRecord(
                current,
                mapRemoteEntryToRecord({
                  entry: patched,
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
        assertEditingUnlocked(config, "entries.deleteEntry");
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
        assertEditingUnlocked(config, "entries.mergeFiscalPeriodEntries");
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
          if (record.partner.trim().length > 0)
            partner.add(record.partner.trim());
          if (record.taxCategory.trim().length > 0)
            tax.add(record.taxCategory.trim());
          if (record.businessCategory.trim().length > 0)
            biz.add(record.businessCategory.trim());
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
        if (fiscalPeriodId == null || fiscalPeriodId.length === 0) {
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
  accounts: MasterBookAccount[];
  taxes: MasterTaxCategory[];
  businesses: MasterBusinessCategory[];
}): EntryRecord {
  const lines: EntryLine[] = input.entry.lines.map((line): EntryLine => ({
    side: line.side,
    accountName: mapBookAccountName(line.bookAccountId, input.accounts),
    accountType: mapAccountType(line.bookAccountId, input.accounts, "asset"),
    amount: formatAmount(line.amount),
    bookAccountId: line.bookAccountId,
    partnerName: line.partnerName,
    taxCategoryId: line.taxCategoryId,
    taxCategoryName: mapTaxName(line.taxCategoryId, input.taxes),
    businessCategoryId: line.businessCategoryId,
    businessCategoryName: mapBusinessName(
      line.businessCategoryId,
      input.businesses,
    ),
    id: null,
  }));
  const debitLine = lines.find((line) => line.side === "debit") ?? null;
  const creditLine = lines.find((line) => line.side === "credit") ?? null;
  const headerPartner =
    input.entry.lines[0]?.partnerName ??
    input.entry.lines[1]?.partnerName ??
    "";
  const headerTax = mapTaxName(
    input.entry.lines[0]?.taxCategoryId ??
      input.entry.lines[1]?.taxCategoryId ??
      "",
    input.taxes,
  );
  const headerBiz = mapBusinessName(
    input.entry.lines[0]?.businessCategoryId ??
      input.entry.lines[1]?.businessCategoryId ??
      "",
    input.businesses,
  );
  const date = input.entry.date;
  return {
    id: input.entry.id,
    fiscalPeriodId: input.fiscalPeriodId,
    date,
    weekday: weekdayJa(date),
    lines,
    debit: debitLine?.accountName ?? "",
    debitType: debitLine?.accountType ?? "asset",
    debitAmount: debitLine?.amount ?? "0",
    credit: creditLine?.accountName ?? "",
    creditType: creditLine?.accountType ?? "liability",
    creditAmount: creditLine?.amount ?? "0",
    description: input.entry.description,
    partner: headerPartner,
    businessRate: formatBusinessRatePercent(input.entry.businessRate ?? 1),
    businessRateRatio: input.entry.businessRate ?? 1,
    taxCategory: headerTax,
    businessCategory: headerBiz,
    localId: input.entry.localId ?? null,
    debitBookAccountId: debitLine?.bookAccountId ?? null,
    creditBookAccountId: creditLine?.bookAccountId ?? null,
    debitTaxCategoryId:
      input.entry.lines.find((l) => l.side === "debit")?.taxCategoryId ?? null,
    creditTaxCategoryId:
      input.entry.lines.find((l) => l.side === "credit")?.taxCategoryId ?? null,
    debitBusinessCategoryId:
      input.entry.lines.find((l) => l.side === "debit")?.businessCategoryId ??
      null,
    creditBusinessCategoryId:
      input.entry.lines.find((l) => l.side === "credit")?.businessCategoryId ??
      null,
  };
}

function mapBookAccountName(
  id: string | null,
  accounts: MasterBookAccount[],
): string {
  if (id == null || id.length === 0) return "";
  return accounts.find((account) => account.id === id)?.name ?? id;
}

function mapTaxName(idOrName: string, categories: MasterTaxCategory[]): string {
  if (idOrName.length === 0) return "対象外";
  return (
    categories.find((category) => category.id === idOrName)?.name ??
    categories.find((category) => category.name === idOrName)?.name ??
    idOrName
  );
}

function mapBusinessName(
  idOrName: string,
  categories: MasterBusinessCategory[],
): string {
  if (idOrName.length === 0) return "対象外";
  return (
    categories.find((category) => category.id === idOrName)?.name ??
    categories.find((category) => category.name === idOrName)?.name ??
    idOrName
  );
}

function mapAccountType(
  id: string | null,
  accounts: MasterBookAccount[],
  fallback: EntryRecord["debitType"],
): EntryRecord["debitType"] {
  if (id == null) return fallback;
  return (accounts.find((account) => account.id === id)?.accountType ??
    fallback) as EntryRecord["debitType"];
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.abs(value));
}

function buildEntryApiLinesFromDraft(
  draft: EntryDraft,
  master: {
    accounts: MasterBookAccount[];
    taxes: MasterTaxCategory[];
    businesses: MasterBusinessCategory[];
  },
  errorContext: { messageForDeveloper: string; messageForUser: string },
): EntryApiLineInput[] {
  const lines: EntryApiLineInput[] = draft.lines.map((line) => ({
    side: line.side,
    bookAccountId:
      resolveBookAccountId({
        explicitId: line.bookAccountId,
        accountName: line.accountName,
        accountType: line.accountType,
        accounts: master.accounts,
      }) ?? "",
    amount: parseAmount(line.amount),
    partnerName: line.partnerName ?? draft.partner,
    taxCategoryId: resolveTaxCategoryId(
      line.taxCategoryId ?? null,
      draft.taxCategory,
      master.taxes,
    ),
    businessCategoryId: resolveBusinessCategoryId(
      line.businessCategoryId ?? null,
      draft.businessCategory,
      master.businesses,
    ),
  }));
  if (lines.some((line) => line.bookAccountId === "")) {
    throw new AppError({
      messageForDeveloper: errorContext.messageForDeveloper,
      messageForUser: errorContext.messageForUser,
      originalMessage: null,
      statusCode: null,
    });
  }
  return lines;
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
    });
  }
  return value;
}
