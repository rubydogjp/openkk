"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { useOpenkkAppState } from "../shared/openkk-app-state";
import { useBackendApi } from "../shared/backend-api-context";
import {
  entryRecordToImportPayload,
  resolveBookAccountId,
  resolveBusinessCategoryId,
  resolveTaxCategoryId,
  safeRate,
} from "./import-mapping";

export { entryRecordToImportPayload } from "./import-mapping";
import type {
  EntryApiRecord,
  EntryApiLine,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "@rubydogjp/openkk-client-ports";

import {
  parseAmount,
  parseIsoLocalDate,
  recordToPreviewRows,
  weekdayJa,
  type EntryRecord,
  type EntryLine,
} from "@rubydogjp/openkk-client-domain";
import type {
  EntryAccountVisualType,
  EntryPreviewRow,
} from "@rubydogjp/openkk-client-domain";

export type EntryDraft = {
  date: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  lines: EntryLine[];
};

export type EntryMasterAccountOption = {
  id: string;
  name: string;
  accountType: EntryAccountVisualType;
};

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
  ) => Promise<{ imported: number; skipped: number }>;

  accountOptions: EntryMasterAccountOption[];
  taxCategoryOptions: EntryMasterCategoryOption[];
  businessCategoryOptions: EntryMasterCategoryOption[];

  listSuggestions: (fiscalPeriodId: string) => EntrySuggestions;

  loadError: unknown;
  reload: () => void;
};

const EntriesContext = createContext<EntriesState | null>(null);

export function OpenkkEntriesProvider(props: { children: ReactNode }) {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();

  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [bookAccounts, setBookAccounts] = useState<MasterBookAccount[]>([]);
  const [taxCategories, setTaxCategories] = useState<MasterTaxCategory[]>([]);
  const [businessCategories, setBusinessCategories] = useState<
    MasterBusinessCategory[]
  >([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

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
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] master data load failed:", error);
        setLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  useEffect(() => {
    const fiscalPeriodId = appState.currentFiscalPeriodId;
    if (fiscalPeriodId == null || fiscalPeriodId.length === 0) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const remoteEntries = await backendApi.entries.getAll(fiscalPeriodId);
        if (cancelled) return;
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
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] entries load failed:", error);
        setLoadError(error);
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
    reloadNonce,
  ]);

  const value = useMemo<EntriesState>(() => {
    const accountOptions: EntryMasterAccountOption[] = bookAccounts.map(
      (account) => ({
        id: account.id,
        name: account.name,
        accountType: (account.accountType ?? "asset") as EntryAccountVisualType,
      }),
    );
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
        const created = await backendApi.entries.create(fiscalPeriodId, {
          date: draft.date,
          description: draft.description,
          businessRate: safeRate(draft.businessRate),
          lines,
        });
        const mapped = mapRemoteEntryToRecord({
          entry: created,
          fiscalPeriodId,
          accounts: bookAccounts,
          taxes: taxCategories,
          businesses: businessCategories,
        });
        setRecords((current) => [...current, mapped]);
        return mapped.id;
      },
      async saveEntry(entryId, draft) {
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
        const patched = await backendApi.entries.patch(
          currentRecord.fiscalPeriodId,
          entryId,
          {
            date: draft.date,
            description: draft.description,
            localId: currentRecord.localId,
            businessRate: safeRate(draft.businessRate),
            lines,
          },
        );
        setRecords((current) =>
          current.map((record) =>
            record.id === entryId
              ? mapRemoteEntryToRecord({
                  entry: patched,
                  fiscalPeriodId: currentRecord.fiscalPeriodId,
                  accounts: bookAccounts,
                  taxes: taxCategories,
                  businesses: businessCategories,
                })
              : record,
          ),
        );
        return true;
      },
      async deleteEntry(entryId) {
        const currentRecord = records.find((record) => record.id === entryId);
        if (currentRecord == null) {
          return false;
        }
        await backendApi.entries.remove(currentRecord.fiscalPeriodId, entryId);
        setRecords((current) => removeEntryRecord(current, entryId));
        return true;
      },
      async mergeFiscalPeriodEntries(fiscalPeriodId, importedEntries) {
        const payload = importedEntries.map((entry) =>
          entryRecordToImportPayload(entry, {
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          }),
        );
        const response = await backendApi.entries.importMany(
          fiscalPeriodId,
          payload,
        );
        const appended = response.entries.map((entry) =>
          mapRemoteEntryToRecord({
            entry,
            fiscalPeriodId,
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          }),
        );
        setRecords((current) => [...current, ...appended]);
        return {
          imported: response.importedCount,
          skipped: Math.max(0, importedEntries.length - response.importedCount),
        };
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
    };
  }, [bookAccounts, businessCategories, records, taxCategories, loadError]);

  return (
    <EntriesContext.Provider value={value}>
      {props.children}
    </EntriesContext.Provider>
  );
}

export function replaceFiscalPeriodEntryRecords(
  current: EntryRecord[],
  fiscalPeriodId: string | null,
  nextRecords: EntryRecord[],
): EntryRecord[] {
  if (fiscalPeriodId == null || fiscalPeriodId.length === 0) return [];
  return [
    ...current.filter((record) => record.fiscalPeriodId !== fiscalPeriodId),
    ...nextRecords,
  ];
}

export function removeEntryRecord(
  current: EntryRecord[],
  entryId: string,
): EntryRecord[] {
  return current.filter((record) => record.id !== entryId);
}

function mapRemoteEntryToRecord(input: {
  entry: EntryApiRecord;
  fiscalPeriodId: string;
  accounts: MasterBookAccount[];
  taxes: MasterTaxCategory[];
  businesses: MasterBusinessCategory[];
}): EntryRecord {
  const lines: EntryLine[] = input.entry.lines.map((line) => ({
    side: line.side,
    accountName: mapBookAccountName(line.bookAccountId, input.accounts),
    accountType: mapAccountType(line.bookAccountId, input.accounts, "asset"),
    amount: formatAmount(line.amount),
    bookAccountId: line.bookAccountId,
  }));
  const debitLine = lines.find((line) => line.side === "debit") ?? null;
  const creditLine = lines.find((line) => line.side === "credit") ?? null;
  const headerPartner =
    input.entry.lines[0]?.partnerName ??
    input.entry.lines[1]?.partnerName ??
    "";
  const headerTax = mapTaxName(
    input.entry.lines[0]?.taxCategoryName ??
      input.entry.lines[1]?.taxCategoryName ??
      "",
    input.taxes,
  );
  const headerBiz = mapBusinessName(
    input.entry.lines[0]?.businessCategoryName ??
      input.entry.lines[1]?.businessCategoryName ??
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
    businessRate: String(Math.round((input.entry.businessRate ?? 1) * 100)),
    taxCategory: headerTax,
    businessCategory: headerBiz,
    localId: input.entry.localId,
    debitBookAccountId: debitLine?.bookAccountId,
    creditBookAccountId: creditLine?.bookAccountId,
    debitTaxCategoryId: input.entry.lines.find((l) => l.side === "debit")
      ?.taxCategoryName,
    creditTaxCategoryId: input.entry.lines.find((l) => l.side === "credit")
      ?.taxCategoryName,
    debitBusinessCategoryId: input.entry.lines.find((l) => l.side === "debit")
      ?.businessCategoryName,
    creditBusinessCategoryId: input.entry.lines.find((l) => l.side === "credit")
      ?.businessCategoryName,
  };
}

function mapBookAccountName(
  id: string | undefined,
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
  id: string | undefined,
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
): EntryApiLine[] {
  const lines: EntryApiLine[] = draft.lines.map((line) => ({
    side: line.side,
    bookAccountId:
      resolveBookAccountId({
        explicitId: line.bookAccountId,
        accountName: line.accountName,
        accountType: line.accountType,
        accounts: master.accounts,
      }) ?? "",
    amount: parseAmount(line.amount),
    partnerName: draft.partner,
    taxCategoryName: resolveTaxCategoryId(
      null,
      draft.taxCategory,
      master.taxes,
    ),
    businessCategoryName: resolveBusinessCategoryId(
      null,
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
