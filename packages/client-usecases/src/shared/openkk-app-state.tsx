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

import type {
  FiscalPeriodApiRecord,
  FiscalPeriodPatchInput,
  FiscalPeriodNextCreateInput,
} from "@rubydogjp/openkk-client-ports";
import {
  AppError,
  buildBootstrapFiscalPeriodId,
  buildBootstrapUser,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  type EntryRecord,
  type FiscalPeriodArchivePayload,
  type CustomUser,
  type FiscalPeriod,
  type FiscalPeriodOpeningBalanceLine,
  type OpenkkUser,
  type Session,
} from "@rubydogjp/openkk-client-domain";
import { useBackendApi } from "./backend-api-context.js";
import { useOpenkkConfig } from "./openkk-config-context.js";
import { entryRecordToImportPayload } from "../entries/import-mapping.js";
import { assertEditingUnlocked } from "./editing-policy.js";
import {
  AsyncStateVersion,
  KeyedAsyncStateVersion,
} from "./async-state-version.js";
import { AsyncMutationQueue } from "./async-mutation-queue.js";
import {
  applyFiscalPeriodUpdate,
  mapRemoteFiscalPeriod,
} from "./fiscal-period-list.js";
import { assertAuthUnchanged } from "./auth-operation-guard.js";
import {
  browserLocalStorage,
  readStoredUser,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from "./browser-storage.js";

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
  ) => Promise<string | null>;
  createNextFiscalPeriod: (
    input: FiscalPeriodNextCreateInput,
  ) => Promise<string>;
  importArchivedFiscalPeriod: (
    payload: FiscalPeriodArchivePayload,
  ) => Promise<string | null>;
  updateFiscalPeriod: (
    fiscalPeriodId: string,
    input:
      | FiscalPeriodPatchInput
      | ((current: FiscalPeriod) => FiscalPeriodPatchInput | null),
  ) => Promise<boolean>;
  startFiscalPeriod: (fiscalPeriodId: string) => Promise<boolean>;
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
  openingBalanceLines: FiscalPeriodOpeningBalanceLine[];
  entries: EntryRecord[];
};

export type FiscalPeriodSeeder = (ctx: {
  fiscalPeriod: FiscalPeriodApiRecord;
  isFirst: boolean;
}) => FiscalPeriodSeed | null;

export function OpenkkAppStateProvider(props: {
  children: ReactNode;
  seedFiscalPeriod: FiscalPeriodSeeder | null;
}) {
  const config = useOpenkkConfig();
  const backendApi = useBackendApi();
  const seedFiscalPeriod = props.seedFiscalPeriod;
  const authVersion = useRef(new AsyncStateVersion());
  const authMutationQueue = useRef(new AsyncMutationQueue());
  const fiscalPeriodMutationQueue = useRef(new AsyncMutationQueue());
  const fiscalPeriodListVersion = useRef(new KeyedAsyncStateVersion<string>());

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
      authVersion.current.invalidate();
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
        const periods = await backendApi.fiscalPeriods.getAll();
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
            : buildBootstrapFiscalPeriodId(config);
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
      safeStorageSet(storage, config.sessionStorageKey, JSON.stringify(user));
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
    const runFiscalPeriodCommand = async (
      operation: string,
      command: () => Promise<FiscalPeriodApiRecord>,
    ) => {
      assertEditingUnlocked(config.editingPolicy, operation);
      const operationVersion = authVersion.current.capture();
      return await fiscalPeriodMutationQueue.current.run(async () => {
        assertAuthUnchanged(authVersion.current, operationVersion);
        const updated = await command();
        assertAuthUnchanged(authVersion.current, operationVersion);
        fiscalPeriodListVersion.current.invalidate("all");
        fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
          fiscalPeriodsRef.current,
          updated,
        );
        setFiscalPeriods((current) =>
          applyFiscalPeriodUpdate(current, updated),
        );
        return true;
      });
    };
    return {
      session: user == null ? null : { user },
      captureAuthOperationVersion() {
        return authVersion.current.capture();
      },
      isAuthOperationCurrent(expectedVersion) {
        return authVersion.current.isCurrent(expectedVersion);
      },
      assertAuthOperationCurrent(expectedVersion) {
        assertAuthUnchanged(authVersion.current, expectedVersion);
      },
      fiscalPeriods,
      currentFiscalPeriodId,
      isReady,
      fiscalPeriodLoadError,
      reloadFiscalPeriods() {
        setFiscalPeriodReloadNonce((nonce) => nonce + 1);
      },
      async createFiscalPeriod(input) {
        assertEditingUnlocked(config.editingPolicy, "appState.createFiscalPeriod");
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const created = await backendApi.fiscalPeriods.create(input);
          assertAuthUnchanged(authVersion.current, operationVersion);
          try {
            const seed =
              seedFiscalPeriod?.({
                fiscalPeriod: created,
                isFirst: fiscalPeriodsRef.current.length === 0,
              }) ?? null;
            let final = created;
            if (seed != null) {
              final = await backendApi.fiscalPeriods.patch(created.id, {
                opening: {
                  openingBalanceLines: seed.openingBalanceLines,
                  openingJournals: [],
                },
              });
              assertAuthUnchanged(authVersion.current, operationVersion);
              if (seed.entries.length > 0) {
                await backendApi.entries.importMany(
                  created.id,
                  seed.entries.map((record) =>
                    entryRecordToImportInput(record),
                  ),
                );
                assertAuthUnchanged(authVersion.current, operationVersion);
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
            setCurrentFiscalPeriodId(final.id);
            return final.id;
          } catch (error) {
            assertAuthUnchanged(authVersion.current, operationVersion);
            try {
              await backendApi.fiscalPeriods.remove(created.id);
            } catch (cleanupError) {
              throw fiscalPeriodCleanupError(created.id, error, cleanupError);
            }
            throw error;
          }
        });
      },
      async createNextFiscalPeriod(input) {
        assertEditingUnlocked(config.editingPolicy, "appState.createNextFiscalPeriod");
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const created = await backendApi.fiscalPeriods.createNext(input);
          assertAuthUnchanged(authVersion.current, operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
            fiscalPeriodsRef.current,
            created,
          );
          setFiscalPeriods((current) =>
            applyFiscalPeriodUpdate(current, created),
          );
          return created.id;
        });
      },
      async importArchivedFiscalPeriod(payload) {
        assertEditingUnlocked(config.editingPolicy, "appState.importArchivedFiscalPeriod");
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const imported =
            await backendApi.fiscalPeriods.importArchived(payload);
          assertAuthUnchanged(authVersion.current, operationVersion);
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
        assertEditingUnlocked(config.editingPolicy, "appState.updateFiscalPeriod");
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const current = fiscalPeriodsRef.current.find(
            (period) => period.id === fiscalPeriodId,
          );
          if (current == null) return false;
          const resolved = typeof input === "function" ? input(current) : input;
          if (resolved == null) return false;
          const patched = await backendApi.fiscalPeriods.patch(
            fiscalPeriodId,
            resolved,
          );
          assertAuthUnchanged(authVersion.current, operationVersion);
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
      startFiscalPeriod(fiscalPeriodId) {
        return runFiscalPeriodCommand("appState.startFiscalPeriod", () =>
          backendApi.fiscalPeriods.start(fiscalPeriodId),
        );
      },
      archiveFiscalPeriod(fiscalPeriodId) {
        return runFiscalPeriodCommand("appState.archiveFiscalPeriod", () =>
          backendApi.fiscalPeriods.archive(fiscalPeriodId),
        );
      },
      purgeArchivedFiscalPeriod(fiscalPeriodId) {
        return runFiscalPeriodCommand("appState.purgeArchivedFiscalPeriod", () =>
          backendApi.fiscalPeriods.purgeArchivedData(fiscalPeriodId),
        );
      },
      async discardFiscalPeriod(fiscalPeriodId) {
        assertEditingUnlocked(config.editingPolicy, "appState.discardFiscalPeriod");
        const operationVersion = authVersion.current.capture();
        await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          await backendApi.fiscalPeriods.remove(fiscalPeriodId);
          assertAuthUnchanged(authVersion.current, operationVersion);
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = fiscalPeriodsRef.current.filter(
            (period) => period.id !== fiscalPeriodId,
          );
          setFiscalPeriods((current) =>
            current.filter((period) => period.id !== fiscalPeriodId),
          );
          setCurrentFiscalPeriodId((current) =>
            current === fiscalPeriodId
              ? buildBootstrapFiscalPeriodId(config)
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
        authVersion.current.invalidate();
        fiscalPeriodsRef.current = [];
        setFiscalPeriods([]);
        setFiscalPeriodLoadError(null);
        setCurrentFiscalPeriodId(buildBootstrapFiscalPeriodId(config));
        setUser(config.embeddedUser);
        setFiscalPeriodReloadNonce((nonce) => nonce + 1);
      },
      async signOut() {
        const operationVersion = authVersion.current.invalidate();
        return await authMutationQueue.current.run(async () => {
          try {
            await backendApi.auth.signOut();
          } finally {
            if (authVersion.current.isCurrent(operationVersion)) {
              fiscalPeriodListVersion.current.invalidate("all");
              fiscalPeriodsRef.current = [];
              setFiscalPeriods([]);
              setFiscalPeriodLoadError(null);
              setUser(buildBootstrapUser(config));
              setCurrentFiscalPeriodId(buildBootstrapFiscalPeriodId(config));
              setFiscalPeriodReloadNonce((nonce) => nonce + 1);
            }
          }
        });
      },
      async startSignIn(redirectUrl) {
        const operationVersion = authVersion.current.capture();
        return await authMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const started = await backendApi.auth.startSession(redirectUrl);
          assertAuthUnchanged(authVersion.current, operationVersion);
          return started;
        });
      },
      async completeSignIn({ state, code }) {
        const operationVersion = authVersion.current.invalidate();
        return await authMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const completed = await backendApi.auth.completeSession({
            state,
            code,
          });
          assertAuthUnchanged(authVersion.current, operationVersion);
          const token = await backendApi.auth.redeemCompletionCode(
            completed.completionCode,
          );
          assertAuthUnchanged(authVersion.current, operationVersion);
          const signedInUser: CustomUser = {
            kind: "custom",
            id: token.userId,
            displayName: token.displayName ?? token.userId,
            email:
              token.email == null || token.email.trim() === ""
                ? null
                : token.email.trim(),
            iconUrl: token.iconUrl ?? null,
            authProvider: token.authProvider ?? "custom",
          };
          fiscalPeriodListVersion.current.invalidate("all");
          fiscalPeriodsRef.current = [];
          setFiscalPeriods([]);
          setFiscalPeriodLoadError(null);
          setCurrentFiscalPeriodId(buildBootstrapFiscalPeriodId(config));
          setUser(signedInUser);
          setFiscalPeriodReloadNonce((nonce) => nonce + 1);
          return signedInUser;
        });
      },
      selectFiscalPeriod(fiscalPeriodId) {
        setCurrentFiscalPeriodId(fiscalPeriodId);
      },
      clearFiscalPeriod() {
        setCurrentFiscalPeriodId(buildBootstrapFiscalPeriodId(config));
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
      code: null,
    });
  }
  return value;
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
    code: null,
  });
}
