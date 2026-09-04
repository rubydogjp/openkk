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

import type { FiscalPeriodApiRecord } from "@rubydogjp/openkk-client-ports";
import {
  AppError,
  buildBootstrapFiscalPeriodId,
  buildBootstrapUser,
  buildSignedOutFiscalPeriodId,
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
import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkConfig } from "./openkk-config-context.js";
import { entryRecordToImportPayload } from "../entries/import-mapping.js";
import { assertEditingUnlocked } from "./editing-policy.js";
import { AsyncStateVersion } from "./async-state-version.js";
import { AsyncMutationQueue } from "./async-mutation-queue.js";
import { AuthOperationGuard } from "./auth-operation-guard.js";
import {
  browserLocalStorage,
  readStoredUser,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from "./browser-storage.js";

type FiscalPeriodUpdate = Partial<{
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
}>;

type OpenkkAppState = {
  session: Session | null;
  captureAuthOperationVersion: () => number;
  isAuthOperationCurrent: (expectedVersion: number) => boolean;
  assertAuthOperationCurrent: (expectedVersion: number) => void;
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
    input:
      | FiscalPeriodUpdate
      | ((current: FiscalPeriod) => FiscalPeriodUpdate | null),
  ) => Promise<boolean>;
  archiveFiscalPeriod: (fiscalPeriodId: string) => Promise<boolean>;
  purgeArchivedFiscalPeriod: (fiscalPeriodId: string) => Promise<boolean>;
  discardFiscalPeriod: (fiscalPeriodId: string) => Promise<void>;
  syncFiscalPeriod: (period: FiscalPeriodApiRecord) => void;
  signInAsEmbeddedUser: () => void;
  signOut: () => Promise<void>;

  startSignIn: (redirectUrl: string) => Promise<{ authUrl: string }>;

  completeSignIn: (input: {
    state: string;
    code: string;
  }) => Promise<OpenkkUser>;
  selectFiscalPeriod: (fiscalPeriodId: string) => void;
  clearFiscalPeriod: () => void;
};

const OpenkkAppStateContext = createContext<OpenkkAppState | null>(null);

export type FiscalPeriodSeed = {
  openingBalanceLines: { id: string; accountId: string; amount: number }[];
  entries: EntryRecord[];
};

export type FiscalPeriodSeedProvider = (ctx: {
  fiscalPeriod: FiscalPeriodApiRecord;
  isFirst: boolean;
}) => FiscalPeriodSeed | null;

export function OpenkkAppStateProvider(props: {
  children: ReactNode;
  seedFiscalPeriod?: FiscalPeriodSeedProvider;
}) {
  const config = useOpenkkConfig();
  const backendApi = useBackendApi();
  const seedFiscalPeriod = props.seedFiscalPeriod;
  const authOperationGuard = useRef(new AuthOperationGuard());
  const authMutationQueue = useRef(new AsyncMutationQueue());
  const fiscalPeriodMutationQueue = useRef(new AsyncMutationQueue());
  const fiscalPeriodListVersion = useRef(new AsyncStateVersion<string>());

  const [isReady, setIsReady] = useState<boolean>(false);

  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const fiscalPeriodsRef = useRef<FiscalPeriod[]>(fiscalPeriods);
  fiscalPeriodsRef.current = fiscalPeriods;
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
    return () => {
      authOperationGuard.current.invalidate();
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsReady(true);
      return;
    }

    const storage = browserLocalStorage();
    if (config.authMode === "custom") {
      const restored = readStoredUser(
        safeStorageGet(storage, config.sessionStorageKey),
      );
      if (restored != null) setUser(restored);
    }
    const storedFp = safeStorageGet(storage, config.fiscalPeriodStorageKey);
    if (storedFp != null) setCurrentFiscalPeriodId(storedFp);
    setIsReady(true);
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId == null) {
      fiscalPeriodsRef.current = [];
      setFiscalPeriods([]);
      return;
    }
    let cancelled = false;
    const readVersion = fiscalPeriodListVersion.current.capture("all");
    void (async () => {
      try {
        const periods = await backendApi.fiscalPeriod.getAll();
        if (
          cancelled ||
          !fiscalPeriodListVersion.current.isCurrent("all", readVersion)
        ) {
          return;
        }
        const mapped = periods.map(mapRemoteFiscalPeriod);
        fiscalPeriodsRef.current = mapped;
        setFiscalPeriods(mapped);
        setFiscalPeriodLoadError(null);
        setCurrentFiscalPeriodId((current) => {
          if (current == null || current === "") return current;
          return mapped.some((period) => period.id === current)
            ? current
            : buildSignedOutFiscalPeriodId(config);
        });
      } catch (error) {
        if (
          cancelled ||
          !fiscalPeriodListVersion.current.isCurrent("all", readVersion)
        ) {
          return;
        }
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

    const storage = browserLocalStorage();
    if (user != null && user.kind === "custom") {
      safeStorageSet(
        storage,
        config.sessionStorageKey,
        JSON.stringify(user),
      );
    } else {
      safeStorageRemove(storage, config.sessionStorageKey);
    }
  }, [user, config]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storage = browserLocalStorage();
    if (currentFiscalPeriodId == null || currentFiscalPeriodId === "") {
      safeStorageRemove(storage, config.fiscalPeriodStorageKey);
    } else {
      safeStorageSet(
        storage,
        config.fiscalPeriodStorageKey,
        currentFiscalPeriodId,
      );
    }
  }, [currentFiscalPeriodId, config]);

  const value = useMemo<OpenkkAppState>(() => {
    return {
      session: user == null ? null : { user },
      captureAuthOperationVersion() {
        return authOperationGuard.current.capture();
      },
      isAuthOperationCurrent(expectedVersion) {
        return authOperationGuard.current.isCurrent(expectedVersion);
      },
      assertAuthOperationCurrent(expectedVersion) {
        authOperationGuard.current.assertCurrent(expectedVersion);
      },
      fiscalPeriods,
      currentFiscalPeriodId,
      isReady,
      fiscalPeriodLoadError,
      reloadFiscalPeriods() {
        setFiscalPeriodReloadNonce((nonce) => nonce + 1);
      },
      async createFiscalPeriod(input, options) {
        assertEditingUnlocked(config, "appState.createFiscalPeriod");
        const operationVersion = authOperationGuard.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const created = await backendApi.fiscalPeriod.create(input);
          authOperationGuard.current.assertCurrent(operationVersion);
          try {
            const seed =
              seedFiscalPeriod?.({
                fiscalPeriod: created,
                isFirst: fiscalPeriodsRef.current.length === 0,
              }) ?? null;
            let final = created;
            if (seed != null) {
              final = await backendApi.fiscalPeriod.patch(created.id, {
                opening: {
                  id: `op-${created.id}`,
                  userId: user?.id ?? config.mockUserId,
                  fiscalPeriodId: created.id,
                  openingBalanceLines: seed.openingBalanceLines,
                  openingJournals: [],
                },
              });
              authOperationGuard.current.assertCurrent(operationVersion);
              if (seed.entries.length > 0) {
                await backendApi.entries.importMany(
                  created.id,
                  seed.entries.map((record) =>
                    entryRecordToImportInput(record),
                  ),
                );
                authOperationGuard.current.assertCurrent(operationVersion);
              }
            }
            fiscalPeriodListVersion.current.invalidate("all");
            fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
              fiscalPeriodsRef.current,
              final,
            );
            setFiscalPeriods((current) =>
              applyFiscalPeriodUpdate(current, final),
            );
            if (options?.select !== false) {
              setCurrentFiscalPeriodId(final.id);
            }
            return final.id;
          } catch (error) {
            authOperationGuard.current.assertCurrent(operationVersion);
            try {
              await backendApi.fiscalPeriod.remove(created.id);
            } catch (cleanupError) {
              throw fiscalPeriodCleanupError(created.id, error, cleanupError);
            }
            throw error;
          }
        });
      },
      async importArchivedFiscalPeriod(payload) {
        assertEditingUnlocked(config, "appState.importArchivedFiscalPeriod");
        const operationVersion = authOperationGuard.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const imported =
            await backendApi.fiscalPeriod.importArchived(payload);
          authOperationGuard.current.assertCurrent(operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
            fiscalPeriodsRef.current,
            imported,
          );
          setFiscalPeriods((current) =>
            applyFiscalPeriodUpdate(current, imported),
          );
          return imported.id;
        });
      },
      async updateFiscalPeriod(fiscalPeriodId, input) {
        assertEditingUnlocked(config, "appState.updateFiscalPeriod");
        const operationVersion = authOperationGuard.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const current = fiscalPeriodsRef.current.find(
            (period) => period.id === fiscalPeriodId,
          );
          if (current == null) return false;
          const resolved =
            typeof input === "function" ? input(current) : input;
          if (resolved == null) return false;
          const patched = await backendApi.fiscalPeriod.patch(fiscalPeriodId, {
            name: resolved.name,
            startDate: resolved.startDate,
            endDate: resolved.endDate,
            settingsCompleted: resolved.settingsCompleted,
            openingBalancesCompleted: resolved.openingBalancesCompleted,
            documentsReceivedCompleted: resolved.documentsReceivedCompleted,
            opening: resolved.opening,
          });
          authOperationGuard.current.assertCurrent(operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
            fiscalPeriodsRef.current,
            patched,
          );
          setFiscalPeriods((currentPeriods) =>
            applyFiscalPeriodUpdate(currentPeriods, patched),
          );
          return true;
        });
      },
      async archiveFiscalPeriod(fiscalPeriodId) {
        assertEditingUnlocked(config, "appState.archiveFiscalPeriod");
        const operationVersion = authOperationGuard.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const archived = await backendApi.fiscalPeriod.archive(fiscalPeriodId);
          authOperationGuard.current.assertCurrent(operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
            fiscalPeriodsRef.current,
            archived,
          );
          setFiscalPeriods((current) =>
            applyFiscalPeriodUpdate(current, archived),
          );
          return true;
        });
      },
      async purgeArchivedFiscalPeriod(fiscalPeriodId) {
        assertEditingUnlocked(config, "appState.purgeArchivedFiscalPeriod");
        const operationVersion = authOperationGuard.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const purged =
            await backendApi.fiscalPeriod.purgeArchivedData(fiscalPeriodId);
          authOperationGuard.current.assertCurrent(operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
            fiscalPeriodsRef.current,
            purged,
          );
          setFiscalPeriods((current) =>
            applyFiscalPeriodUpdate(current, purged),
          );
          return true;
        });
      },
      async discardFiscalPeriod(fiscalPeriodId) {
        const operationVersion = authOperationGuard.current.capture();
        await fiscalPeriodMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          await backendApi.fiscalPeriod.remove(fiscalPeriodId);
          authOperationGuard.current.assertCurrent(operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = fiscalPeriodsRef.current.filter(
            (period) => period.id !== fiscalPeriodId,
          );
          setFiscalPeriods((current) =>
            current.filter((period) => period.id !== fiscalPeriodId),
          );
          setCurrentFiscalPeriodId((current) =>
            current === fiscalPeriodId
              ? buildSignedOutFiscalPeriodId(config)
              : current,
          );
        });
      },
      syncFiscalPeriod(period) {
        if (period.userId !== user?.id) return;
        fiscalPeriodListVersion.current.invalidate("all");
        fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
          fiscalPeriodsRef.current,
          period,
        );
        setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, period));
      },
      signInAsEmbeddedUser() {
        authOperationGuard.current.invalidate();
        fiscalPeriodsRef.current = [];
        setFiscalPeriods([]);
        setFiscalPeriodLoadError(null);
        setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
        setUser(config.embeddedUser);
        setFiscalPeriodReloadNonce((nonce) => nonce + 1);
      },
      async signOut() {
        const operationVersion = authOperationGuard.current.invalidate();
        return await authMutationQueue.current.run(async () => {
          try {
            await backendApi.auth.signOut();
          } finally {
            if (authOperationGuard.current.isCurrent(operationVersion)) {
              fiscalPeriodListVersion.current.invalidate("all");
              fiscalPeriodsRef.current = [];
              setFiscalPeriods([]);
              setFiscalPeriodLoadError(null);
              setUser(buildBootstrapUser(config));
              setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
              setFiscalPeriodReloadNonce((nonce) => nonce + 1);
            }
          }
        });
      },
      async startSignIn(redirectUrl) {
        const operationVersion = authOperationGuard.current.capture();
        return await authMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const started = await backendApi.auth.startSession(redirectUrl);
          authOperationGuard.current.assertCurrent(operationVersion);
          return started;
        });
      },
      async completeSignIn({ state, code }) {
        const operationVersion = authOperationGuard.current.invalidate();
        return await authMutationQueue.current.run(async () => {
          authOperationGuard.current.assertCurrent(operationVersion);
          const completed = await backendApi.auth.completeSession({
            state,
            code,
          });
          authOperationGuard.current.assertCurrent(operationVersion);
          const token = await backendApi.auth.redeemCompletionCode(
            completed.completionCode,
          );
          authOperationGuard.current.assertCurrent(operationVersion);
          const signedInUser: CustomUser = {
            kind: "custom",
            id: token.userId,
            displayName: token.displayName ?? token.userId,
            email: token.email ?? "",
            iconUrl: token.iconUrl ?? null,
            authProvider: token.authProvider ?? "custom",
          };
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = [];
          setFiscalPeriods([]);
          setFiscalPeriodLoadError(null);
          setCurrentFiscalPeriodId(buildSignedOutFiscalPeriodId(config));
          setUser(signedInUser);
          setFiscalPeriodReloadNonce((nonce) => nonce + 1);
          return signedInUser;
        });
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
    seedFiscalPeriod,
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
  const mapped = mapRemoteFiscalPeriod(patched);
  const index = current.findIndex((period) => period.id === patched.id);
  if (index < 0) return [...current, mapped];
  return current.flatMap((period, currentIndex) => {
    if (period.id !== patched.id) return [period];
    return currentIndex === index ? [mapped] : [];
  });
}

const DEFAULT_IMPORT_MASTER = {
  accounts: DEFAULT_BOOK_ACCOUNTS,
  taxes: DEFAULT_TAX_CATEGORIES,
  businesses: DEFAULT_BUSINESS_CATEGORIES,
};

function entryRecordToImportInput(record: EntryRecord) {
  return entryRecordToImportPayload(record, DEFAULT_IMPORT_MASTER);
}

function fiscalPeriodCleanupError(
  fiscalPeriodId: string,
  originalError: unknown,
  cleanupError: unknown,
): AppError {
  return new AppError({
    messageForDeveloper: `fiscal period initialization and cleanup failed: ${fiscalPeriodId}; original=${String(originalError)}; cleanup=${String(cleanupError)}`,
    messageForUser:
      "会計期間の初期化に失敗し、作成途中の期間も自動削除できませんでした。期間一覧を再読込して不要な期間を確認してください",
    originalMessage: String(originalError),
    statusCode: null,
  });
}
