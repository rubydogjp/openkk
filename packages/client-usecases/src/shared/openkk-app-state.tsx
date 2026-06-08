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
  AppError,
  buildBootstrapFiscalPeriodId,
  buildBootstrapUser,
  buildDemoSeedEntriesForFiscalPeriod,
  buildSignedOutFiscalPeriodId,
  demoOpeningBalanceLines,
  summarizeOpeningBalances,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  type EntryRecord,
  type FiscalPeriodArchivePayload,
} from "@rubydogjp/openkk-client-domain";
import type {
  CustomUser,
  FiscalPeriod,
  OpenkkUser,
  Session,
} from "@rubydogjp/openkk-client-domain";
import { useBackendApi } from "./backend-api-context";
import { useOpenkkConfig } from "./openkk-config-context";
import { entryRecordToImportPayload } from "../entries/import-mapping";

type OpenkkAppState = {
  session: Session | null;
  fiscalPeriods: FiscalPeriod[];
  currentFiscalPeriodId: string | null;
  isReady: boolean;
  fiscalPeriodLoadError: unknown;
  reloadFiscalPeriods: () => void;
  createFiscalPeriod: (
    input: {
      name: string;
      startDate: string;
      endDate: string;
    },
    options?: { select?: boolean },
  ) => Promise<string | null>;
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
      opening: Omit<
        NonNullable<FiscalPeriod["opening"]>,
        "createdAt" | "updatedAt"
      >;
    }>,
  ) => Promise<boolean>;
  archiveFiscalPeriod: (fiscalPeriodId: string) => Promise<boolean>;
  purgeArchivedFiscalPeriod: (fiscalPeriodId: string) => Promise<boolean>;
  syncFiscalPeriod: (period: FiscalPeriodApiRecord) => void;
  signInAsEmbeddedUser: () => void;
  signOut: () => void;

  startSignIn: (redirectUrl: string) => Promise<{ authUrl: string }>;

  completeSignIn: (input: {
    state: string;
    code: string;
  }) => Promise<OpenkkUser>;
  selectFiscalPeriod: (fiscalPeriodId: string) => void;
  clearFiscalPeriod: () => void;
};

const OpenkkAppStateContext = createContext<OpenkkAppState | null>(null);

export function OpenkkAppStateProvider(props: { children: ReactNode }) {
  const config = useOpenkkConfig();
  const backendApi = useBackendApi();

  const [isReady, setIsReady] = useState<boolean>(false);

  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [fiscalPeriodLoadError, setFiscalPeriodLoadError] =
    useState<unknown>(null);
  const [fiscalPeriodReloadNonce, setFiscalPeriodReloadNonce] = useState(0);

  const [user, setUser] = useState<OpenkkUser | null>(() =>
    buildBootstrapUser(config),
  );
  const [currentFiscalPeriodId, setCurrentFiscalPeriodId] = useState<
    string | null
  >(() => buildBootstrapFiscalPeriodId(config));
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsReady(true);
      return;
    }

    // EmbeddedUser は毎起動で自動サインイン（保存は参照しない）。CustomUser は
    // 前回サインイン時に保存したユーザーを復元する。
    if (config.authMode === "custom") {
      const restored = readStoredUser(
        window.localStorage.getItem(config.sessionStorageKey),
      );
      if (restored != null) setUser(restored);
    }
    const storedFp = window.localStorage.getItem(config.fiscalPeriodStorageKey);
    if (storedFp != null) setCurrentFiscalPeriodId(storedFp);
    setIsReady(true);
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId == null) {
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
        setFiscalPeriodLoadError(null);
        setCurrentFiscalPeriodId((current) => {
          if (current == null || current === "") return current;
          return mapped.some((period) => period.id === current)
            ? current
            : buildSignedOutFiscalPeriodId(config);
        });
      } catch (error) {
        if (cancelled) return;
        console.error("[openkk] fiscal period load failed:", error);
        setFiscalPeriodLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendApi, config, userId, fiscalPeriodReloadNonce]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // CustomUser のみ復元用に保存する。EmbeddedUser は毎起動で自動サインインするため保存不要。
    if (user != null && user.kind === "custom") {
      window.localStorage.setItem(
        config.sessionStorageKey,
        JSON.stringify(user),
      );
    } else {
      window.localStorage.removeItem(config.sessionStorageKey);
    }
  }, [user, config]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (currentFiscalPeriodId == null || currentFiscalPeriodId === "") {
      window.localStorage.removeItem(config.fiscalPeriodStorageKey);
    } else {
      window.localStorage.setItem(
        config.fiscalPeriodStorageKey,
        currentFiscalPeriodId,
      );
    }
  }, [currentFiscalPeriodId]);

  const value = useMemo<OpenkkAppState>(() => {
    return {
      session: user == null ? null : { user },
      fiscalPeriods,
      currentFiscalPeriodId,
      isReady,
      fiscalPeriodLoadError,
      reloadFiscalPeriods() {
        setFiscalPeriodReloadNonce((nonce) => nonce + 1);
      },
      async createFiscalPeriod(input, options) {
        const created = await backendApi.fiscalPeriod.create(input);

        const isDemoFirstPeriod =
          config.isDemoMode && fiscalPeriods.length === 0;
        let final = created;
        if (isDemoFirstPeriod) {
          final = await backendApi.fiscalPeriod.patch(created.id, {
            opening: {
              id: `op-${created.id}`,
              userId: user?.id ?? config.mockUserId,
              fiscalPeriodId: created.id,
              openingBalanceLines: demoOpeningBalanceLines,
              openingJournals: [],
            },
          });
          const seededEntries = buildDemoSeedEntriesForFiscalPeriod(created.id);
          await backendApi.entries.importMany(
            created.id,
            seededEntries.map((record) => entryRecordToImportInput(record)),
          );
        }
        setFiscalPeriods((current) => [
          ...current,
          mapRemoteFiscalPeriod(final),
        ]);
        if (options?.select !== false) {
          setCurrentFiscalPeriodId(final.id);
        }
        return final.id;
      },
      async importArchivedFiscalPeriod(payload) {
        const imported = await backendApi.fiscalPeriod.importArchived(payload);
        setFiscalPeriods((current) => [
          ...current,
          mapRemoteFiscalPeriod(imported),
        ]);
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
        setFiscalPeriods((current) =>
          applyFiscalPeriodUpdate(current, patched),
        );
        return true;
      },
      async archiveFiscalPeriod(fiscalPeriodId) {
        const archived = await backendApi.fiscalPeriod.archive(fiscalPeriodId);
        setFiscalPeriods((current) =>
          applyFiscalPeriodUpdate(current, archived),
        );
        return true;
      },
      async purgeArchivedFiscalPeriod(fiscalPeriodId) {
        const purged =
          await backendApi.fiscalPeriod.purgeArchivedData(fiscalPeriodId);
        setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, purged));
        return true;
      },
      syncFiscalPeriod(period) {
        setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, period));
      },
      signInAsEmbeddedUser() {
        setFiscalPeriods([]);
        setUser(config.embeddedUser);
      },
      signOut() {
        void backendApi.auth.signOut().catch(() => undefined);
        setFiscalPeriods([]);
        // EmbeddedUser はサインアウト不可。再度自動サインイン状態へ戻す。
        setUser(buildBootstrapUser(config));
        setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
      },
      async startSignIn(redirectUrl) {
        return await backendApi.auth.startSession(redirectUrl);
      },
      async completeSignIn({ state, code }) {
        const completed = await backendApi.auth.completeSession({
          state,
          code,
        });
        const token = await backendApi.auth.redeemCompletionCode(
          completed.completionCode,
        );
        const signedInUser: CustomUser = {
          kind: "custom",
          id: token.userId,
          displayName: token.displayName ?? token.userId,
          email: token.email ?? "",
          iconUrl: token.iconUrl ?? null,
          authProvider: token.authProvider ?? "custom",
        };
        setFiscalPeriods([]);
        setUser(signedInUser);
        return signedInUser;
      },
      selectFiscalPeriod(fiscalPeriodId) {
        setCurrentFiscalPeriodId(fiscalPeriodId);
      },
      clearFiscalPeriod() {
        setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
      },
    };
  }, [
    currentFiscalPeriodId,
    fiscalPeriods,
    isReady,
    fiscalPeriodLoadError,
    user,
    config,
    backendApi,
  ]);

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

function readStoredUser(raw: string | null): OpenkkUser | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomUser>;
    if (parsed.kind !== "custom" || typeof parsed.id !== "string") return null;
    return {
      kind: "custom",
      id: parsed.id,
      displayName: parsed.displayName ?? parsed.id,
      email: parsed.email ?? "",
      iconUrl: parsed.iconUrl ?? null,
      authProvider: parsed.authProvider ?? "custom",
    };
  } catch {
    return null;
  }
}

function mapRemoteFiscalPeriod(period: FiscalPeriodApiRecord): FiscalPeriod {
  const openingBalanceLines = period.opening?.openingBalanceLines ?? [];
  const openingSummary = summarizeOpeningBalances(openingBalanceLines);
  return {
    id: period.id,
    userId: period.userId,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    phase: period.phase,
    archiveStatus: period.archiveStatus,
    archiveDataAvailable: period.archiveDataAvailable ?? true,
    archivedAt: period.archivedAt ?? null,
    settingsCompleted: period.settingsCompleted,
    openingBalancesCompleted: period.openingBalancesCompleted,
    documentsReceivedCompleted: period.documentsReceivedCompleted,
    openingDebitTotal: openingSummary.assets,
    openingCreditTotal: openingSummary.liabilities + openingSummary.equity,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
    opening:
      period.opening == null
        ? undefined
        : {
            id: period.opening.id,
            userId: period.opening.userId,
            fiscalPeriodId: period.opening.fiscalPeriodId,
            createdAt: period.opening.createdAt,
            updatedAt: period.opening.updatedAt,
            openingBalanceLines: (period.opening.openingBalanceLines ?? []).map(
              (line) => ({
                id: line.id,
                accountId: line.accountId,
                amount: line.amount,
              }),
            ),
            openingJournals: (period.opening.openingJournals ?? []).map(
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
                  taxCategoryId: line.taxCategoryId,
                  businessCategoryId: line.businessCategoryId,
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

const DEMO_IMPORT_MASTER = {
  accounts: DEFAULT_BOOK_ACCOUNTS,
  taxes: DEFAULT_TAX_CATEGORIES,
  businesses: DEFAULT_BUSINESS_CATEGORIES,
};

function entryRecordToImportInput(record: EntryRecord) {
  return entryRecordToImportPayload(record, DEMO_IMPORT_MASTER);
}
