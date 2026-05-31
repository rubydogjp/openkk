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
import type {
  EntryApiRecord,
  EntryApiLine,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "@rubydogjp/openkk-client-ports";

import {
  parseAmount,
  recordToPreviewRows,
  type EntryRecord,
  type EntryLine,
} from "@rubydogjp/openkk-client-domain";
import type { EntryAccountVisualType, EntryPreviewRow } from "@rubydogjp/openkk-client-domain";

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
  listMonthRows: (fiscalPeriodId: string, yearMonth: string) => EntryPreviewRow[];
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
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fiscalPeriodId = appState.currentFiscalPeriodId;
    if (fiscalPeriodId == null || fiscalPeriodId.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const remoteEntries = await backendApi.entries.getAll(fiscalPeriodId);
        if (cancelled) return;
        setRecords((current) => {
          const rest = current.filter(
            (record) => record.fiscalPeriodId !== fiscalPeriodId,
          );
          return [
            ...rest,
            ...remoteEntries.map((entry) =>
              mapRemoteEntryToRecord({
                entry,
                fiscalPeriodId,
                accounts: bookAccounts,
                taxes: taxCategories,
                businesses: businessCategories,
              }),
            ),
          ];
        });
      } catch {
        if (cancelled) return;
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
  ]);

  const value = useMemo<EntriesState>(() => {
    const accountOptions: EntryMasterAccountOption[] = bookAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      accountType: (account.accountType ??
        "asset") as EntryAccountVisualType,
    }));
    const taxCategoryOptions: EntryMasterCategoryOption[] = taxCategories.map(
      (category) => ({ id: category.id, name: category.name }),
    );
    const businessCategoryOptions: EntryMasterCategoryOption[] = businessCategories.map(
      (category) => ({ id: category.id, name: category.name }),
    );

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
        const patched = await backendApi.entries.patch(currentRecord.fiscalPeriodId, entryId, {
          date: draft.date,
          description: draft.description,
          localId: currentRecord.localId,
          businessRate: safeRate(draft.businessRate),
          lines,
        });
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
        let deleted = false;
        setRecords((current) =>
          current.filter((record) => {
            if (record.id !== entryId) return true;
            deleted = true;
            return false;
          }),
        );
        return deleted;
      },
      async mergeFiscalPeriodEntries(fiscalPeriodId, importedEntries) {
        const payload = importedEntries.map((entry) =>
          toImportPayload(entry, {
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          }),
        );
        const response = await backendApi.entries.importMany(fiscalPeriodId, payload);
        const appended = response.entries.map((entry) =>
          mapRemoteEntryToRecord({
            entry,
            fiscalPeriodId,
            accounts: bookAccounts,
            taxes: taxCategories,
            businesses: businessCategories,
          }),
        );
        // importMany skips existing localIds server-side, so every returned
        // record is newly inserted and can simply be appended.
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
          if (record.partner.trim().length > 0) partner.add(record.partner.trim());
          if (record.taxCategory.trim().length > 0) tax.add(record.taxCategory.trim());
          if (record.businessCategory.trim().length > 0)
            biz.add(record.businessCategory.trim());

        }
        return {
          partner: Array.from(partner).sort(),
          taxCategory: Array.from(tax).sort(),
          businessCategory: Array.from(biz).sort(),
        };
      },
    };
  }, [bookAccounts, businessCategories, records, taxCategories]);

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

function weekdayJa(dateText: string): string {
  const date = new Date(dateText);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return weekdays[date.getDay()] ?? "";
}

function safeRate(value: string): number {
  if (value.trim() === "") return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, parsed) / 100;
}

function resolveBookAccountId(input: {
  explicitId?: string | null;
  accountName: string;
  accountType?: EntryAccountVisualType;
  accounts: MasterBookAccount[];
}): string | null {
  if (input.explicitId != null && input.explicitId.length > 0) {
    const byId = input.accounts.find((account) => account.id === input.explicitId);
    if (byId != null) return byId.id;
  }
  const byNameAndType = input.accounts.find(
    (account) =>
      account.name === input.accountName &&
      (input.accountType == null || account.accountType === input.accountType),
  );
  if (byNameAndType != null) return byNameAndType.id;
  const found = input.accounts.find((account) => account.name === input.accountName);
  return found?.id ?? null;
}

function resolveTaxCategoryId(
  explicitId: string | null,
  name: string,
  categories: MasterTaxCategory[],
): string {
  if (explicitId != null && explicitId.length > 0) {
    const byId = categories.find((category) => category.id === explicitId);
    if (byId != null) return byId.id;
    const byName = categories.find((category) => category.name === explicitId);
    if (byName != null) return byName.id;
  }
  return (
    categories.find((category) => category.name === name)?.id ??
    (name.trim() === "" ? "tax_exempt" : name)
  );
}

function resolveBusinessCategoryId(
  explicitId: string | null,
  name: string,
  categories: MasterBusinessCategory[],
): string {
  if (explicitId != null && explicitId.length > 0) {
    const byId = categories.find((category) => category.id === explicitId);
    if (byId != null) return byId.id;
    const byName = categories.find((category) => category.name === explicitId);
    if (byName != null) return byName.id;
  }
  return (
    categories.find((category) => category.name === name)?.id ??
    (name.trim() === "" ? "biz_none" : name)
  );
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
    taxCategoryName: resolveTaxCategoryId(null, draft.taxCategory, master.taxes),
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

function toImportPayload(
  entry: EntryRecord,
  master: {
    accounts: MasterBookAccount[];
    taxes: MasterTaxCategory[];
    businesses: MasterBusinessCategory[];
  },
): {
  date: string;
  description: string;
  localId?: string;
  businessRate: number;
  lines: EntryApiLine[];
} {

  const debitBookAccountId =
    resolveBookAccountId({
      explicitId: entry.debitBookAccountId,
      accountName: entry.debit,
      accountType: entry.debitType,
      accounts: master.accounts,
    }) ??
    "";
  const creditBookAccountId =
    resolveBookAccountId({
      explicitId: entry.creditBookAccountId,
      accountName: entry.credit,
      accountType: entry.creditType,
      accounts: master.accounts,
    }) ??
    "";
  if (debitBookAccountId === "" || creditBookAccountId === "") {
    throw new AppError({
      messageForDeveloper: "entries.import: unresolved bookAccountId",
      messageForUser: "勘定科目の解決に失敗したため取込みできませんでした",
      originalMessage: null,
      statusCode: null,
    });
  }
  const taxCategoryId = resolveTaxCategoryId(
    entry.debitTaxCategoryId ?? entry.creditTaxCategoryId ?? null,
    entry.taxCategory,
    master.taxes,
  );
  const businessCategoryId = resolveBusinessCategoryId(
    entry.debitBusinessCategoryId ?? entry.creditBusinessCategoryId ?? null,
    entry.businessCategory,
    master.businesses,
  );
  return {
    date: entry.date,
    description: entry.description,
    localId: entry.localId,
    businessRate: safeRate(entry.businessRate),
    lines: [
      {
        side: "debit",
        bookAccountId: debitBookAccountId,
        amount: parseAmount(entry.debitAmount),
        partnerName: entry.partner,
        taxCategoryName: taxCategoryId,
        businessCategoryName: businessCategoryId,
      },
      {
        side: "credit",
        bookAccountId: creditBookAccountId,
        amount: parseAmount(entry.creditAmount),
        partnerName: entry.partner,
        taxCategoryName: taxCategoryId,
        businessCategoryName: businessCategoryId,
      },
    ],
  };
}

export function useOpenkkEntries() {
  const value = useContext(EntriesContext);
  if (value == null) {
    throw new Error(
      "useOpenkkEntries must be used within OpenkkEntriesProvider",
    );
  }
  return value;
}
