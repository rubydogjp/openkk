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
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FiscalPeriodNextCreateInput,
} from "@rubydogjp/openkk-client-ports";
import {
  AppError,
  buildBootstrapFiscalPeriodId,
  buildBootstrapUser,
  type FiscalPeriodArchivePayload,
  type FiscalPeriod,
  type OpenkkUser,
  type Session,
} from "@rubydogjp/openkk-client-domain";
import { BackendApiProvider, useBackendApi } from "./backend-api-context.js";
import { useOpenkkConfig } from "./openkk-config-context.js";
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
import { usePlatformAdapter } from "./platform-adapter-context.js";
import { readStoredUser } from "./stored-user.js";
import { buildCustomUser } from "./custom-user.js";
import { createSignInReturnPathStore } from "./sign-in-return-path.js";
import { wrapWithSessionExpiry } from "./session-expiry.js";

type OpenkkAppState = {
  session: Session | null;
  captureAuthOperationVersion: () => number;
  isAuthOperationCurrent: (expectedVersion: number) => boolean;
  assertAuthOperationCurrent: (expectedVersion: number) => void;
  fiscalPeriods: FiscalPeriod[];
  currentFiscalPeriodId: string | null;
  currentFiscalPeriod: FiscalPeriod | null;
  isReady: boolean;
  fiscalPeriodLoadError: unknown;
  reloadFiscalPeriods: () => void;
  createFiscalPeriod: (input: FiscalPeriodCreateInput) => Promise<string>;
  createNextFiscalPeriod: (
    input: FiscalPeriodNextCreateInput,
  ) => Promise<string>;
  importArchivedFiscalPeriod: (
    payload: FiscalPeriodArchivePayload,
  ) => Promise<string>;
  updateFiscalPeriod: (
    fiscalPeriodId: string,
    input:
      | FiscalPeriodPatchInput
      | ((current: FiscalPeriod) => FiscalPeriodPatchInput | null),
  ) => Promise<boolean>;
  startFiscalPeriod: (fiscalPeriodId: string) => Promise<void>;
  archiveFiscalPeriod: (fiscalPeriodId: string) => Promise<void>;
  purgeArchivedFiscalPeriod: (fiscalPeriodId: string) => Promise<void>;
  discardFiscalPeriod: (fiscalPeriodId: string) => Promise<void>;
  syncFiscalPeriod: (period: FiscalPeriodApiRecord) => void;
  signInAsEmbeddedUser: () => void;
  signOut: () => Promise<void>;
  startSignIn: (
    redirectUrl: string,
    returnPath: string | null,
  ) => Promise<{ authUrl: string }>;
  takeSignInReturnPath: () => string | null;
  completeSignIn: (state: string, code: string) => Promise<OpenkkUser>;
  selectFiscalPeriod: (fiscalPeriodId: string) => void;
  clearFiscalPeriod: () => void;
};

const OpenkkAppStateContext = createContext<OpenkkAppState | null>(null);

export function OpenkkAppStateProvider(props: { children: ReactNode }) {
  const config = useOpenkkConfig();
  const sourceBackendApi = useBackendApi();
  const storage = usePlatformAdapter().storage;
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
  const userRef = useRef(user);
  userRef.current = user;

  function replaceUser(nextUser: OpenkkUser | null) {
    fiscalPeriodListVersion.current.invalidate("all");
    fiscalPeriodsRef.current = [];
    setFiscalPeriods([]);
    setFiscalPeriodLoadError(null);
    setUser(nextUser);
    setCurrentFiscalPeriodId(buildBootstrapFiscalPeriodId(config));
    setFiscalPeriodReloadNonce((nonce) => nonce + 1);
  }

  function resetToSignedOut() {
    replaceUser(buildBootstrapUser(config));
  }

  function storeFiscalPeriod(period: FiscalPeriodApiRecord) {
    fiscalPeriodListVersion.current.invalidate("all");
    fiscalPeriodsRef.current = applyFiscalPeriodUpdate(
      fiscalPeriodsRef.current,
      period,
    );
    setFiscalPeriods((current) => applyFiscalPeriodUpdate(current, period));
  }

  const backendApi = useMemo(() => {
    if (config.authMode !== "custom") return sourceBackendApi;
    return wrapWithSessionExpiry(sourceBackendApi, {
      captureAuthVersion: () => authVersion.current.capture(),
      expireIfAuthUnchangedSince: (version) => {
        if (!authVersion.current.isCurrent(version)) return;
        if (userRef.current?.kind !== "custom") return;
        authVersion.current.invalidate();
        resetToSignedOut();
      },
    });
  }, [sourceBackendApi, config]);

  useEffect(() => {
    return () => {
      authVersion.current.invalidate();
    };
  }, []);
  useEffect(() => {
    if (config.authMode === "custom") {
      const restored = readStoredUser(
        storage.getItem(config.sessionStorageKey),
      );
      if (restored != null) setUser(restored);
    }
    const storedFiscalPeriodId = storage.getItem(config.fiscalPeriodStorageKey);
    if (storedFiscalPeriodId != null && storedFiscalPeriodId !== "") {
      setCurrentFiscalPeriodId(storedFiscalPeriodId);
    }
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
          if (current == null) return current;
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
    if (user != null && user.kind === "custom") {
      storage.setItem(config.sessionStorageKey, JSON.stringify(user));
    } else {
      storage.removeItem(config.sessionStorageKey);
    }
  }, [user, config, storage]);

  useEffect(() => {
    if (currentFiscalPeriodId == null) {
      storage.removeItem(config.fiscalPeriodStorageKey);
    } else {
      storage.setItem(config.fiscalPeriodStorageKey, currentFiscalPeriodId);
    }
  }, [currentFiscalPeriodId, config, storage]);

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
        storeFiscalPeriod(updated);
      });
    };
    const signInReturnPath = createSignInReturnPathStore(
      storage,
      config.sessionStorageKey,
    );
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
      currentFiscalPeriod:
        fiscalPeriods.find((period) => period.id === currentFiscalPeriodId) ??
        null,
      isReady,
      fiscalPeriodLoadError,
      reloadFiscalPeriods() {
        setFiscalPeriodReloadNonce((nonce) => nonce + 1);
      },
      async createFiscalPeriod(input) {
        assertEditingUnlocked(
          config.editingPolicy,
          "appState.createFiscalPeriod",
        );
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const created = await backendApi.fiscalPeriods.create(input);
          assertAuthUnchanged(authVersion.current, operationVersion);
          storeFiscalPeriod(created);
          setCurrentFiscalPeriodId(created.id);
          return created.id;
        });
      },
      async createNextFiscalPeriod(input) {
        assertEditingUnlocked(
          config.editingPolicy,
          "appState.createNextFiscalPeriod",
        );
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const created = await backendApi.fiscalPeriods.createNext(input);
          assertAuthUnchanged(authVersion.current, operationVersion);
          storeFiscalPeriod(created);
          return created.id;
        });
      },
      async importArchivedFiscalPeriod(payload) {
        assertEditingUnlocked(
          config.editingPolicy,
          "appState.importArchivedFiscalPeriod",
        );
        const operationVersion = authVersion.current.capture();
        return await fiscalPeriodMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const imported =
            await backendApi.fiscalPeriods.importArchived(payload);
          assertAuthUnchanged(authVersion.current, operationVersion);
          storeFiscalPeriod(imported);
          return imported.id;
        });
      },
      async updateFiscalPeriod(fiscalPeriodId, input) {
        assertEditingUnlocked(
          config.editingPolicy,
          "appState.updateFiscalPeriod",
        );
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
          storeFiscalPeriod(patched);
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
        return runFiscalPeriodCommand(
          "appState.purgeArchivedFiscalPeriod",
          () => backendApi.fiscalPeriods.purgeArchivedData(fiscalPeriodId),
        );
      },
      async discardFiscalPeriod(fiscalPeriodId) {
        assertEditingUnlocked(
          config.editingPolicy,
          "appState.discardFiscalPeriod",
        );
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
        storeFiscalPeriod(period);
      },
      signInAsEmbeddedUser() {
        authVersion.current.invalidate();
        replaceUser(config.embeddedUser);
      },
      async signOut() {
        const operationVersion = authVersion.current.invalidate();
        return await authMutationQueue.current.run(async () => {
          try {
            await backendApi.auth.signOut();
          } finally {
            if (authVersion.current.isCurrent(operationVersion)) {
              resetToSignedOut();
            }
          }
        });
      },
      async startSignIn(redirectUrl, returnPath) {
        signInReturnPath.replace(returnPath, new Date());
        const operationVersion = authVersion.current.capture();
        try {
          return await authMutationQueue.current.run(async () => {
            assertAuthUnchanged(authVersion.current, operationVersion);
            const started = await backendApi.auth.startSession(redirectUrl);
            assertAuthUnchanged(authVersion.current, operationVersion);
            return started;
          });
        } catch (error) {
          signInReturnPath.forget();
          throw error;
        }
      },
      takeSignInReturnPath() {
        return signInReturnPath.take(new Date());
      },
      async completeSignIn(state, code) {
        const operationVersion = authVersion.current.invalidate();
        return await authMutationQueue.current.run(async () => {
          assertAuthUnchanged(authVersion.current, operationVersion);
          const completed = await backendApi.auth.completeSession(state, code);
          assertAuthUnchanged(authVersion.current, operationVersion);
          const token = await backendApi.auth.redeemCompletionCode(
            completed.completionCode,
          );
          assertAuthUnchanged(authVersion.current, operationVersion);
          const signedInUser = buildCustomUser({
            id: token.userId,
            displayName: token.displayName,
            email: token.email,
            iconUrl: token.iconUrl,
            authProvider: token.authProvider,
          });
          replaceUser(signedInUser);
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
    storage,
  ]);

  return (
    <OpenkkAppStateContext.Provider value={value}>
      <BackendApiProvider api={backendApi}>{props.children}</BackendApiProvider>
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
