import {
  buildBootstrapFiscalPeriodId,
  buildBootstrapUser,
  type FiscalPeriod,
  type FiscalPeriodArchivePayload,
  type OpenkkConfig,
  type OpenkkUser,
  type Session,
} from "../../domain/index.js";
import type {
  FiscalPeriodApiRecord,
  FiscalPeriodCarryoverApplyInput,
  FiscalPeriodCreateInput,
  FiscalPeriodNextCreateInput,
  FiscalPeriodPatchInput,
  OpenkkBackendPort,
  PlatformKeyValueStorage,
} from "../../ports/index.js";
import { AsyncMutationQueue } from "../shared/async-mutation-queue.js";
import {
  AsyncStateVersion,
  KeyedAsyncStateVersion,
} from "../shared/async-state-version.js";
import { assertAuthUnchanged } from "../shared/auth-operation-guard.js";
import { buildCustomUser } from "../shared/custom-user.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";
import {
  applyFiscalPeriodUpdate,
  mapRemoteFiscalPeriod,
} from "../shared/fiscal-period-list.js";
import {
  createWritableState,
  deriveState,
  type ReadableState,
} from "../shared/observable-state.js";
import { wrapWithSessionExpiry } from "../shared/session-expiry.js";
import { createSignInReturnPathStore } from "../shared/sign-in-return-path.js";
import { readStoredUser } from "../shared/stored-user.js";

export type FiscalPeriodPatchResolver = (
  current: FiscalPeriod,
) => FiscalPeriodPatchInput | null;

export type OpenkkAppState = {
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
  applyCarryoverToFiscalPeriod: (
    fiscalPeriodId: string,
    input: FiscalPeriodCarryoverApplyInput,
  ) => Promise<void>;
  importArchivedFiscalPeriod: (
    payload: FiscalPeriodArchivePayload,
  ) => Promise<string>;
  updateFiscalPeriod: (
    fiscalPeriodId: string,
    input: FiscalPeriodPatchInput | FiscalPeriodPatchResolver,
  ) => Promise<boolean>;
  startFiscalPeriod: (fiscalPeriodId: string) => Promise<void>;
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

export type OpenkkAppStore = ReadableState<OpenkkAppState> & {
  backend: OpenkkBackendPort;
  start(): () => void;
};

type AppData = {
  user: OpenkkUser | null;
  fiscalPeriods: FiscalPeriod[];
  currentFiscalPeriodId: string | null;
  isReady: boolean;
  fiscalPeriodLoadError: unknown;
};

const ALL_FISCAL_PERIODS = "all";

export function createOpenkkAppStore(dependencies: {
  config: OpenkkConfig;
  backend: OpenkkBackendPort;
  storage: PlatformKeyValueStorage;
}): OpenkkAppStore {
  const { config, storage } = dependencies;
  const authVersion = new AsyncStateVersion();
  const authMutationQueue = new AsyncMutationQueue();
  const fiscalPeriodMutationQueue = new AsyncMutationQueue();
  const fiscalPeriodListVersion = new KeyedAsyncStateVersion<string>();
  const signInReturnPath = createSignInReturnPathStore(
    storage,
    config.sessionStorageKey,
  );
  const data = createWritableState<AppData>({
    user: buildBootstrapUser(config),
    fiscalPeriods: [],
    currentFiscalPeriodId: buildBootstrapFiscalPeriodId(config),
    isReady: false,
    fiscalPeriodLoadError: null,
  });
  let started = false;
  let fiscalPeriodLoadGeneration = 0;

  const persistUser = (user: OpenkkUser | null) => {
    if (user != null && user.kind === "custom") {
      storage.setItem(config.sessionStorageKey, JSON.stringify(user));
    } else {
      storage.removeItem(config.sessionStorageKey);
    }
  };

  const persistCurrentFiscalPeriodId = (fiscalPeriodId: string | null) => {
    if (fiscalPeriodId == null) {
      storage.removeItem(config.fiscalPeriodStorageKey);
    } else {
      storage.setItem(config.fiscalPeriodStorageKey, fiscalPeriodId);
    }
  };

  const update = (patch: Partial<AppData>) => {
    const previous = data.getState();
    const next = { ...previous, ...patch };
    if (started && next.user !== previous.user) persistUser(next.user);
    if (
      started &&
      next.currentFiscalPeriodId !== previous.currentFiscalPeriodId
    ) {
      persistCurrentFiscalPeriodId(next.currentFiscalPeriodId);
    }
    data.setState(next);
  };

  const loadFiscalPeriods = () => {
    fiscalPeriodLoadGeneration += 1;
    const generation = fiscalPeriodLoadGeneration;
    if (data.getState().user == null) {
      update({ fiscalPeriods: [] });
      return;
    }
    const readVersion = fiscalPeriodListVersion.capture(ALL_FISCAL_PERIODS);
    const isSuperseded = () =>
      generation !== fiscalPeriodLoadGeneration ||
      !fiscalPeriodListVersion.isCurrent(ALL_FISCAL_PERIODS, readVersion);
    void (async () => {
      try {
        const periods = await backend.fiscalPeriods.getAll();
        if (isSuperseded()) return;
        const mapped = periods.map(mapRemoteFiscalPeriod);
        const selected = data.getState().currentFiscalPeriodId;
        update({
          fiscalPeriods: mapped,
          fiscalPeriodLoadError: null,
          currentFiscalPeriodId:
            selected == null || mapped.some((period) => period.id === selected)
              ? selected
              : buildBootstrapFiscalPeriodId(config),
        });
      } catch (error) {
        if (isSuperseded()) return;
        console.error("[openkk] fiscal period load failed:", error);
        update({ fiscalPeriodLoadError: error });
      }
    })();
  };

  const replaceUser = (nextUser: OpenkkUser | null) => {
    fiscalPeriodListVersion.invalidate(ALL_FISCAL_PERIODS);
    update({
      fiscalPeriods: [],
      fiscalPeriodLoadError: null,
      user: nextUser,
      currentFiscalPeriodId: buildBootstrapFiscalPeriodId(config),
    });
    if (started) loadFiscalPeriods();
  };

  const resetToSignedOut = () => {
    replaceUser(buildBootstrapUser(config));
  };

  const storeFiscalPeriod = (period: FiscalPeriodApiRecord) => {
    fiscalPeriodListVersion.invalidate(ALL_FISCAL_PERIODS);
    update({
      fiscalPeriods: applyFiscalPeriodUpdate(
        data.getState().fiscalPeriods,
        period,
      ),
    });
  };

  const backend =
    config.authMode !== "custom"
      ? dependencies.backend
      : wrapWithSessionExpiry(dependencies.backend, {
          captureAuthVersion: () => authVersion.capture(),
          expireIfAuthUnchangedSince: (version) => {
            if (!authVersion.isCurrent(version)) return;
            if (data.getState().user?.kind !== "custom") return;
            authVersion.invalidate();
            resetToSignedOut();
          },
        });

  const runFiscalPeriodMutation = async <Result>(
    operation: string,
    mutate: (assertAuthStillCurrent: () => void) => Promise<Result>,
  ): Promise<Result> => {
    assertEditingUnlocked(config.editingPolicy, operation);
    const operationVersion = authVersion.capture();
    const assertAuthStillCurrent = () =>
      assertAuthUnchanged(authVersion, operationVersion);
    return await fiscalPeriodMutationQueue.run(async () => {
      assertAuthStillCurrent();
      return await mutate(assertAuthStillCurrent);
    });
  };

  const runFiscalPeriodCommand = (
    operation: string,
    command: () => Promise<FiscalPeriodApiRecord>,
  ): Promise<void> =>
    runFiscalPeriodMutation(operation, async (assertAuthStillCurrent) => {
      const updated = await command();
      assertAuthStillCurrent();
      storeFiscalPeriod(updated);
    });

  const actions = {
    captureAuthOperationVersion: () => authVersion.capture(),
    isAuthOperationCurrent: (expectedVersion: number) =>
      authVersion.isCurrent(expectedVersion),
    assertAuthOperationCurrent: (expectedVersion: number) =>
      assertAuthUnchanged(authVersion, expectedVersion),
    reloadFiscalPeriods: () => loadFiscalPeriods(),
    createFiscalPeriod: (input: FiscalPeriodCreateInput) =>
      runFiscalPeriodMutation(
        "appState.createFiscalPeriod",
        async (assertAuthStillCurrent) => {
          const created = await backend.fiscalPeriods.create(input);
          assertAuthStillCurrent();
          storeFiscalPeriod(created);
          update({ currentFiscalPeriodId: created.id });
          return created.id;
        },
      ),
    createNextFiscalPeriod: (input: FiscalPeriodNextCreateInput) =>
      runFiscalPeriodMutation(
        "appState.createNextFiscalPeriod",
        async (assertAuthStillCurrent) => {
          const created = await backend.fiscalPeriods.createNext(input);
          assertAuthStillCurrent();
          storeFiscalPeriod(created);
          return created.id;
        },
      ),
    applyCarryoverToFiscalPeriod: (
      fiscalPeriodId: string,
      input: FiscalPeriodCarryoverApplyInput,
    ) =>
      runFiscalPeriodCommand("appState.applyCarryoverToFiscalPeriod", () =>
        backend.fiscalPeriods.applyCarryover(fiscalPeriodId, input),
      ),
    importArchivedFiscalPeriod: (payload: FiscalPeriodArchivePayload) =>
      runFiscalPeriodMutation(
        "appState.importArchivedFiscalPeriod",
        async (assertAuthStillCurrent) => {
          const imported = await backend.fiscalPeriods.importArchived(payload);
          assertAuthStillCurrent();
          storeFiscalPeriod(imported);
          return imported.id;
        },
      ),
    updateFiscalPeriod: (
      fiscalPeriodId: string,
      input: FiscalPeriodPatchInput | FiscalPeriodPatchResolver,
    ) =>
      runFiscalPeriodMutation(
        "appState.updateFiscalPeriod",
        async (assertAuthStillCurrent) => {
          const current = data
            .getState()
            .fiscalPeriods.find((period) => period.id === fiscalPeriodId);
          if (current == null) return false;
          const resolved = typeof input === "function" ? input(current) : input;
          if (resolved == null) return false;
          const patched = await backend.fiscalPeriods.patch(
            fiscalPeriodId,
            resolved,
          );
          assertAuthStillCurrent();
          storeFiscalPeriod(patched);
          return true;
        },
      ),
    startFiscalPeriod: (fiscalPeriodId: string) =>
      runFiscalPeriodCommand("appState.startFiscalPeriod", () =>
        backend.fiscalPeriods.start(fiscalPeriodId),
      ),
    discardFiscalPeriod: (fiscalPeriodId: string) =>
      runFiscalPeriodMutation(
        "appState.discardFiscalPeriod",
        async (assertAuthStillCurrent) => {
          await backend.fiscalPeriods.remove(fiscalPeriodId);
          assertAuthStillCurrent();
          fiscalPeriodListVersion.invalidate(ALL_FISCAL_PERIODS);
          const current = data.getState();
          update({
            fiscalPeriods: current.fiscalPeriods.filter(
              (period) => period.id !== fiscalPeriodId,
            ),
            currentFiscalPeriodId:
              current.currentFiscalPeriodId === fiscalPeriodId
                ? buildBootstrapFiscalPeriodId(config)
                : current.currentFiscalPeriodId,
          });
        },
      ),
    syncFiscalPeriod(period: FiscalPeriodApiRecord) {
      if (period.userId !== data.getState().user?.id) return;
      storeFiscalPeriod(period);
    },
    signInAsEmbeddedUser() {
      authVersion.invalidate();
      replaceUser(config.embeddedUser);
    },
    async signOut() {
      const operationVersion = authVersion.invalidate();
      return await authMutationQueue.run(async () => {
        try {
          await backend.auth.signOut();
        } finally {
          if (authVersion.isCurrent(operationVersion)) resetToSignedOut();
        }
      });
    },
    async startSignIn(redirectUrl: string, returnPath: string | null) {
      signInReturnPath.replace(returnPath, new Date());
      const operationVersion = authVersion.capture();
      try {
        return await authMutationQueue.run(async () => {
          assertAuthUnchanged(authVersion, operationVersion);
          const started = await backend.auth.startSession(redirectUrl);
          assertAuthUnchanged(authVersion, operationVersion);
          return started;
        });
      } catch (error) {
        signInReturnPath.forget();
        throw error;
      }
    },
    takeSignInReturnPath: () => signInReturnPath.take(new Date()),
    async completeSignIn(state: string, code: string) {
      const operationVersion = authVersion.invalidate();
      return await authMutationQueue.run(async () => {
        assertAuthUnchanged(authVersion, operationVersion);
        const completed = await backend.auth.completeSession(state, code);
        assertAuthUnchanged(authVersion, operationVersion);
        const token = await backend.auth.redeemCompletionCode(
          completed.completionCode,
        );
        assertAuthUnchanged(authVersion, operationVersion);
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
    selectFiscalPeriod(fiscalPeriodId: string) {
      update({ currentFiscalPeriodId: fiscalPeriodId });
    },
    clearFiscalPeriod() {
      update({ currentFiscalPeriodId: buildBootstrapFiscalPeriodId(config) });
    },
  };

  const view = deriveState(data, (current): OpenkkAppState => ({
    session: current.user == null ? null : { user: current.user },
    fiscalPeriods: current.fiscalPeriods,
    currentFiscalPeriodId: current.currentFiscalPeriodId,
    currentFiscalPeriod:
      current.fiscalPeriods.find(
        (period) => period.id === current.currentFiscalPeriodId,
      ) ?? null,
    isReady: current.isReady,
    fiscalPeriodLoadError: current.fiscalPeriodLoadError,
    ...actions,
  }));

  const restoreStoredSelection = () => {
    const restoredUser =
      config.authMode === "custom"
        ? readStoredUser(storage.getItem(config.sessionStorageKey))
        : null;
    const storedFiscalPeriodId = storage.getItem(config.fiscalPeriodStorageKey);
    const current = data.getState();
    update({
      user: restoredUser ?? current.user,
      currentFiscalPeriodId:
        storedFiscalPeriodId != null && storedFiscalPeriodId !== ""
          ? storedFiscalPeriodId
          : current.currentFiscalPeriodId,
      isReady: true,
    });
  };

  return {
    getState: view.getState,
    subscribe: view.subscribe,
    backend,
    start() {
      restoreStoredSelection();
      started = true;
      persistUser(data.getState().user);
      persistCurrentFiscalPeriodId(data.getState().currentFiscalPeriodId);
      loadFiscalPeriods();
      return () => {
        started = false;
        fiscalPeriodLoadGeneration += 1;
        authVersion.invalidate();
      };
    },
  };
}
