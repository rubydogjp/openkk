"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-client-ports";
import {
  parseAmount,
  parseBusinessRate,
  buildBootstrapFiscalPeriodId,
  buildBootstrapSessionUserId,
  buildDemoSeedEntriesForFiscalPeriod,
  buildSampleSession,
  buildSignedOutFiscalPeriodId,
  getEntryLines,
  sampleOpeningBalanceLines,
  summarizeOpeningBalances,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  type EntryRecord,
} from "@rubydogjp/openkk-client-domain";
import type {
  FiscalPeriod,
  FiscalPeriodStage,
  Session,
} from "@rubydogjp/openkk-client-domain";
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
  }) => Promise<string | null>;
  updateFiscalPeriod: (
    fiscalPeriodId: string,
    input: Partial<{
      name: string;
      startDate: string;
      endDate: string;
      stage: FiscalPeriodStage;
      provisionalClosingCompleted: boolean;
      settingsCompleted: boolean;
      openingBalancesCompleted: boolean;
      documentsReceivedCompleted: boolean;
      openingDebitTotal: number;
      openingCreditTotal: number;
      opening: FiscalPeriod["opening"];
    }>,
  ) => Promise<boolean>;
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
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const periods = await backendApi.fiscalPeriod.getAll();
        if (cancelled) return;
        setFiscalPeriods(periods.map(mapRemoteFiscalPeriod));
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

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
    const mockSession = buildSampleSession(config);
    return {
      session:
        sessionUserId == null ? null : { ...mockSession, userId: sessionUserId },
      fiscalPeriods,
      currentFiscalPeriodId,
      isReady,
      async createFiscalPeriod(input) {
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
              openingBalanceLines: sampleOpeningBalanceLines,
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
        setCurrentFiscalPeriodId(final.id);
        return final.id;
      },
      async updateFiscalPeriod(fiscalPeriodId, input) {

        const effectiveStage = resolveFiscalPeriodPatchStage(input);
        const patched = await backendApi.fiscalPeriod.patch(fiscalPeriodId, {
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          stage: effectiveStage,
          settingsCompleted: input.settingsCompleted,
          openingBalancesCompleted: input.openingBalancesCompleted,
          documentsReceivedCompleted: input.documentsReceivedCompleted,
          opening: input.opening,
        });
        let updated = false;
        setFiscalPeriods((current) =>
          current.map((period) => {
            if (period.id !== fiscalPeriodId) return period;
            updated = true;
            const mapped = mapRemoteFiscalPeriod(patched);
            if (
              input.provisionalClosingCompleted != null &&
              mapped.stage !== "post_closing"
            ) {
              return {
                ...mapped,
                provisionalClosingCompleted: input.provisionalClosingCompleted,
              };
            }
            return mapped;
          }),
        );
        return updated;
      },
      signInAsMockUser() {
        setSessionUserId(config.mockUserId);
      },
      signInAsUser(userId) {
        setSessionUserId(userId);
      },
      signOut() {
        void backendApi.auth.signOut().catch(() => undefined);
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
    throw new Error(
      "useOpenkkAppState must be used within OpenkkAppStateProvider",
    );
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
    stage: period.stage,
    provisionalClosingCompleted: period.stage === "post_closing",
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

export function resolveFiscalPeriodPatchStage(input: {
  stage?: FiscalPeriodStage;
  provisionalClosingCompleted?: boolean;
}): FiscalPeriodStage | undefined {
  if (input.stage != null) return input.stage;
  if (input.provisionalClosingCompleted === false) return "journalizing";
  return undefined;
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
