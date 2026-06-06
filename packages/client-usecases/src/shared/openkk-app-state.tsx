"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  FiscalPeriodApiRecord,
} from "@rubydogjp/openkk-client-ports";
import {
  AppError,
  parseAmount,
  parseBusinessRate,
  buildBootstrapFiscalPeriodId,
  buildBootstrapSessionUserId,
  buildDemoSeedEntriesForFiscalPeriod,
  buildDemoSession,
  buildSignedOutFiscalPeriodId,
  getEntryLines,
  demoOpeningBalanceLines,
  summarizeOpeningBalances,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  type EntryRecord,
  type FiscalPeriodArchivePayload,
} from "@rubydogjp/openkk-client-domain";
import type { FiscalPeriod, Session } from "@rubydogjp/openkk-client-domain";
import { useBackendApi } from "./backend-api-context";
import { useOpenkkConfig } from "./openkk-config-context";

type OpenkkAppState = {
  session: Session | null;
  fiscalPeriods: FiscalPeriod[];
  currentFiscalPeriodId: string | null;
  isReady: boolean;
  createFiscalPeriod: (input: {
    name: string;
    startDate: string;
    endDate: string;
  }, options?: { select?: boolean }) => Promise<string | null>;
  importArchivedFiscalPeriod: (
    payload: FiscalPeriodArchivePayload,
  ) => Promise<string | null>;
  updateFiscalPeriod: (
    fiscalPeriodId: string,
    input: Partial<{
      name: string;
      startDate: string;
      endDate: string;
      settingsCompleted: boolean;
      openingBalancesCompleted: boolean;
      documentsReceivedCompleted: boolean;
      openingDebitTotal: number;
      openingCreditTotal: number;
      opening: FiscalPeriod["opening"];
    }>,
  ) => Promise<boolean>;
  archiveFiscalPeriod: (fiscalPeriodId: string) => Promise<boolean>;
  syncFiscalPeriod: (period: FiscalPeriodApiRecord) => void;
  signInAsMockUser: () => void;
  signInAsUser: (userId: string) => void;
  signOut: () => void;

  startSignIn: (redirectUrl: string) => Promise<{ authUrl: string }>;

  completeSignIn: (input: { state: string; code: string }) => Promise<string>;
  selectFiscalPeriod: (fiscalPeriodId: string) => void;
  clearFiscalPeriod: () => void;
};

const OpenkkAppStateContext = createContext<OpenkkAppState | null>(
  null,
);

export function OpenkkAppStateProvider(props: { children: ReactNode }) {
  const config = useOpenkkConfig();
  const backendApi = useBackendApi();

  const [isReady, setIsReady] = useState<boolean>(false);

  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);

  const [sessionUserId, setSessionUserId] = useState<string | null>(() =>
    buildBootstrapSessionUserId(config),
  );
  const [currentFiscalPeriodId, setCurrentFiscalPeriodId] = useState<string | null>(
    () => buildBootstrapFiscalPeriodId(config),
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsReady(true);
      return;
    }

    const storedUser = window.localStorage.getItem(config.sessionStorageKey);
    if (storedUser != null) setSessionUserId(storedUser);
    const storedFp = window.localStorage.getItem(config.fiscalPeriodStorageKey);
    if (storedFp != null) setCurrentFiscalPeriodId(storedFp);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (sessionUserId == null) {
      setFiscalPeriods([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const periods = await backendApi.fiscalPeriod.getAll();
        if (cancelled) return;
        const mapped = periods.map(mapRemoteFiscalPeriod);
        setFiscalPeriods(mapped);
        setCurrentFiscalPeriodId((current) => {
          if (current == null || current === "") return current;
          return mapped.some((period) => period.id === current)
            ? current
            : buildSignedOutFiscalPeriodId(config);
        });
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendApi, config, sessionUserId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (sessionUserId == null || sessionUserId === "") {
      window.localStorage.removeItem(config.sessionStorageKey);
    } else {
      window.localStorage.setItem(config.sessionStorageKey, sessionUserId);
    }
  }, [sessionUserId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (currentFiscalPeriodId == null || currentFiscalPeriodId === "") {
      window.localStorage.removeItem(config.fiscalPeriodStorageKey);
    } else {
      window.localStorage.setItem(config.fiscalPeriodStorageKey, currentFiscalPeriodId);
    }
  }, [currentFiscalPeriodId]);

  const value = useMemo<OpenkkAppState>(() => {
    const localSession = buildDemoSession(config);
    return {
      session:
        sessionUserId == null ? null : { ...localSession, userId: sessionUserId },
      fiscalPeriods,
      currentFiscalPeriodId,
      isReady,
      async createFiscalPeriod(input, options) {
        const created = await backendApi.fiscalPeriod.create(input);

        const isDemoFirstPeriod =
          config.isDemoMode && fiscalPeriods.length === 0;
        let final = created;
        if (isDemoFirstPeriod) {
          final = await backendApi.fiscalPeriod.patch(created.id, {
            opening: {
              id: `op-${created.id}`,
              userId: sessionUserId ?? config.mockUserId,
              fiscalPeriodId: created.id,
              openingBalanceLines: demoOpeningBalanceLines,
              carryoverJournals: [],
            },
          });
          const seededEntries = buildDemoSeedEntriesForFiscalPeriod(created.id);
          await backendApi.entries.importMany(
            created.id,
            seededEntries.map((record) => entryRecordToImportInput(record)),
          );
        }
        setFiscalPeriods((current) => [...current, mapRemoteFiscalPeriod(final)]);
        if (options?.select !== false) {
          setCurrentFiscalPeriodId(final.id);
        }
        return final.id;
      },
      async importArchivedFiscalPeriod(payload) {
        const imported = await backendApi.fiscalPeriod.importArchived(payload);
        setFiscalPeriods((current) => [...current, mapRemoteFiscalPeriod(imported)]);
        return imported.id;
      },
      async updateFiscalPeriod(fiscalPeriodId, input) {
        const patched = await backendApi.fiscalPeriod.patch(fiscalPeriodId, {
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          settingsCompleted: input.settingsCompleted,
          openingBalancesCompleted: input.openingBalancesCompleted,
          documentsReceivedCompleted: input.documentsReceivedCompleted,
          opening: input.opening,
        });
        setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, patched));
        return true;
      },
      async archiveFiscalPeriod(fiscalPeriodId) {
        const archived = await backendApi.fiscalPeriod.archive(fiscalPeriodId);
        setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, archived));
        return true;
      },
      syncFiscalPeriod(period) {
        setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, period));
      },
      signInAsMockUser() {
        setFiscalPeriods([]);
        setSessionUserId(config.mockUserId);
      },
      signInAsUser(userId) {
        setFiscalPeriods([]);
        setSessionUserId(userId);
      },
      signOut() {
        void backendApi.auth.signOut().catch(() => undefined);
        setFiscalPeriods([]);
        setSessionUserId(null);
        setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
      },
      async startSignIn(redirectUrl) {
        return await backendApi.auth.startSession(redirectUrl);
      },
      async completeSignIn({ state, code }) {
        const completed = await backendApi.auth.completeSession({ state, code });
        const token = await backendApi.auth.redeemCompletionCode(
          completed.completionCode,
        );
        setFiscalPeriods([]);
        setSessionUserId(token.userId);
        return token.userId;
      },
      selectFiscalPeriod(fiscalPeriodId) {
        setCurrentFiscalPeriodId(fiscalPeriodId);
      },
      clearFiscalPeriod() {
        setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
      },
    };
  }, [currentFiscalPeriodId, fiscalPeriods, isReady, sessionUserId, config, backendApi]);

  return (
    <OpenkkAppStateContext.Provider value={value}>
      {props.children}
    </OpenkkAppStateContext.Provider>
  );
}

export function useOpenkkAppState() {
  const value = useContext(OpenkkAppStateContext);
  if (value == null) {
    throw new AppError({
      messageForDeveloper:
        "useOpenkkAppState must be used within OpenkkAppStateProvider",
      messageForUser: "アプリの状態を読み込めませんでした",
      originalMessage: null,
      statusCode: null,
    });
  }
  return value;
}

function mapRemoteFiscalPeriod(period: FiscalPeriodApiRecord): FiscalPeriod {
  const openingBalanceLines = period.opening?.openingBalanceLines ?? [];
  const openingSummary = summarizeOpeningBalances(openingBalanceLines);
  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    phase: period.phase,
    archiveStatus: period.archiveStatus,
    settingsCompleted: period.settingsCompleted,
    openingBalancesCompleted: period.openingBalancesCompleted,
    documentsReceivedCompleted: period.documentsReceivedCompleted,
    openingDebitTotal: openingSummary.assets,
    openingCreditTotal: openingSummary.liabilities + openingSummary.equity,
    opening:
      period.opening == null
        ? undefined
        : {
            id: period.opening.id,
            userId: period.opening.userId,
            fiscalPeriodId: period.opening.fiscalPeriodId,
            openingBalanceLines: (period.opening.openingBalanceLines ?? []).map(
              (line) => ({
                id: line.id,
                accountId: line.accountId,
                amount: line.amount,
              }),
            ),
            carryoverJournals: (period.opening.carryoverJournals ?? []).map(
              (journal) => ({
                id: journal.id,
                date: journal.date,
                description: journal.description,
                businessRate: journal.businessRate,
                lines: (journal.lines ?? []).map((line) => ({
                  id: line.id,
                  side: line.side,
                  bookAccountId: line.bookAccountId,
                  amount: line.amount,
                  partnerName: line.partnerName,
                  taxCategoryName: line.taxCategoryName,
                  businessCategoryName: line.businessCategoryName,
                })),
              }),
            ),
          },
  };
}

export function applyFiscalPeriodUpdate(
  current: FiscalPeriod[],
  patched: FiscalPeriodApiRecord,
): FiscalPeriod[] {
  return current.map((period) => {
    return period.id === patched.id ? mapRemoteFiscalPeriod(patched) : period;
  });
}

function entryRecordToImportInput(
  record: EntryRecord,
) {
  const lines = getEntryLines(record);
  const partnerName = record.partner;
  const taxCategoryName =
    DEFAULT_TAX_CATEGORIES.find((c) => c.name === record.taxCategory)?.id ??
    record.taxCategory;
  const businessCategoryName =
    DEFAULT_BUSINESS_CATEGORIES.find((c) => c.name === record.businessCategory)?.id ??
    record.businessCategory;
  return {
    date: record.date,
    description: record.description,
    localId: record.localId,
    businessRate:
      parseBusinessRate(record.businessRate),
    lines: lines.map((line) => ({
      side: line.side,
      bookAccountId:
        DEFAULT_BOOK_ACCOUNTS.find((acc) => acc.id === line.bookAccountId)?.id ??
        DEFAULT_BOOK_ACCOUNTS.find(
          (acc) =>
            acc.name === line.accountName &&
            acc.accountType === line.accountType,
        )?.id ??
        DEFAULT_BOOK_ACCOUNTS.find((acc) => acc.name === line.accountName)?.id ??
        line.accountName,
      amount: parseAmount(line.amount),
      partnerName,
      taxCategoryName,
      businessCategoryName,
    })),
  };
}
