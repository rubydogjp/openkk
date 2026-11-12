import {
  AppError,
  capFixedAssetPreviewDate,
  draftBusinessRate,
  mapFixedAsset,
  mapOpeningJournalToRecord,
  parseAmount,
  type BookAccount,
  type BookAccountType,
  type FiscalPeriod,
  type FixedAsset,
  type FixedAssetDraft,
  type OpeningCarryoverDraft,
  type OpeningCarryoverRecord,
  type OpenkkConfig,
  type UnresolvedAccountMessages,
} from "../../domain/index.js";
import type { FixedAssetApiRecord } from "../../ports/index.js";
import { loadJournalMaster } from "../records/load-records.js";
import { valueById } from "../shared/value-by-id.js";
import type { OpenkkAppStore } from "../session/app-store.js";
import { KeyedAsyncMutationQueue } from "../shared/async-mutation-queue.js";
import { KeyedAsyncStateVersion } from "../shared/async-state-version.js";
import { assertEditingUnlocked } from "../shared/editing-policy.js";
import {
  createWritableState,
  deriveState,
  type ReadableState,
} from "../shared/observable-state.js";
import {
  buildOpeningJournalLines,
  fixedAssetDraftBusinessRate,
  fixedAssetDraftToPatch,
  listFixedAssetsForPeriod,
  nextOpeningCarryoverId,
  resolveFixedAssetAccountId,
  upsertFixedAsset,
} from "./assist-state-helpers.js";

const MINIMUM_USEFUL_LIFE_YEARS = 1;

export type AssistState = {
  listFixedAssets: (fiscalPeriodId: string) => FixedAsset[];
  getFixedAsset: (assetId: string) => FixedAsset | null;
  addFixedAsset: (draft: FixedAssetDraft) => Promise<string | null>;
  updateFixedAsset: (
    assetId: string,
    draft: FixedAssetDraft,
  ) => Promise<boolean>;
  deleteFixedAsset: (assetId: string) => Promise<boolean>;
  listOpeningCarryovers: (fiscalPeriodId: string) => OpeningCarryoverRecord[];
  getOpeningCarryover: (carryoverId: string) => OpeningCarryoverRecord | null;
  addOpeningCarryover: (
    fiscalPeriodId: string,
    draft: OpeningCarryoverDraft,
  ) => Promise<string | null>;
  updateOpeningCarryover: (
    carryoverId: string,
    draft: OpeningCarryoverDraft,
  ) => Promise<boolean>;
  deleteOpeningCarryover: (carryoverId: string) => Promise<boolean>;

  loadError: unknown;
  reload: () => void;
};

export type OpenkkAssistStore = ReadableState<AssistState> & {
  start(): () => void;
};

type NamedCategory = { id: string; name: string };

type AssistMaster = {
  accounts: BookAccount[];
  taxCategories: NamedCategory[];
  businessCategories: NamedCategory[];
  accountNameById: Record<string, string>;
  accountTypeById: Record<string, BookAccountType>;
  taxCategoryNameById: Record<string, string>;
  businessCategoryNameById: Record<string, string>;
};

type AssistData = {
  fixedAssets: FixedAsset[];
  master: AssistMaster;
  masterLoadError: unknown;
  fixedAssetsLoadError: unknown;
  fiscalPeriods: FiscalPeriod[];
  currentFiscalPeriodId: string | null;
};

type FixedAssetScope = {
  sessionUserId: string | null;
  fiscalPeriodId: string | null;
  fiscalPeriodEndDate: string | null;
  fiscalPeriodDataPurged: boolean;
  previewAsOf: Date;
};

const EMPTY_MASTER: AssistMaster = {
  accounts: [],
  taxCategories: [],
  businessCategories: [],
  accountNameById: {},
  accountTypeById: {},
  taxCategoryNameById: {},
  businessCategoryNameById: {},
};

export function createOpenkkAssistStore(dependencies: {
  config: OpenkkConfig;
  app: OpenkkAppStore;
  today: ReadableState<Date>;
}): OpenkkAssistStore {
  const { config, app, today } = dependencies;
  const backend = app.backend;
  const periodVersions = new KeyedAsyncStateVersion<string>();
  const assetMutationQueue = new KeyedAsyncMutationQueue<string>();
  const data = createWritableState<AssistData>({
    fixedAssets: [],
    master: EMPTY_MASTER,
    masterLoadError: null,
    fixedAssetsLoadError: null,
    fiscalPeriods: app.getState().fiscalPeriods,
    currentFiscalPeriodId: app.getState().currentFiscalPeriodId,
  });
  let started = false;
  let followedScope = readScope();
  let masterLoadGeneration = 0;
  let fixedAssetsLoadGeneration = 0;

  function readScope(): FixedAssetScope {
    const appState = app.getState();
    const period = appState.currentFiscalPeriod;
    const endDate = period?.endDate ?? null;
    return {
      sessionUserId: appState.session?.user.id ?? null,
      fiscalPeriodId: appState.currentFiscalPeriodId,
      fiscalPeriodEndDate: endDate,
      fiscalPeriodDataPurged: period?.archiveStatus === "purged",
      previewAsOf: capFixedAssetPreviewDate(today.getState(), endDate),
    };
  }

  const update = (patch: Partial<AssistData>) => {
    data.setState({ ...data.getState(), ...patch });
  };

  const updateFixedAssets = (
    change: (assets: FixedAsset[]) => FixedAsset[],
  ) => {
    update({ fixedAssets: change(data.getState().fixedAssets) });
  };

  const mapStoredFixedAsset = (asset: FixedAssetApiRecord): FixedAsset => {
    const scope = readScope();
    return mapFixedAsset(
      asset,
      data.getState().master.accountNameById[asset.bookAccountId] ?? null,
      scope.previewAsOf,
      scope.fiscalPeriodEndDate,
    );
  };

  const loadMaster = () => {
    masterLoadGeneration += 1;
    const generation = masterLoadGeneration;
    if (readScope().sessionUserId == null) {
      update({ masterLoadError: null });
      return;
    }
    void (async () => {
      try {
        const loaded = await loadJournalMaster(backend);
        if (generation !== masterLoadGeneration) return;
        update({
          master: {
            accounts: loaded.accounts,
            taxCategories: loaded.taxCategories,
            businessCategories: loaded.businessCategories,
            accountNameById: valueById(
              loaded.accounts,
              (account) => account.name,
            ),
            accountTypeById: valueById(
              loaded.accounts,
              (account) => account.accountType,
            ),
            taxCategoryNameById: valueById(
              loaded.taxCategories,
              (category) => category.name,
            ),
            businessCategoryNameById: valueById(
              loaded.businessCategories,
              (category) => category.name,
            ),
          },
          masterLoadError: null,
        });
        loadFixedAssets();
      } catch (error) {
        if (generation !== masterLoadGeneration) return;
        console.error("[openkk] assist master data load failed:", error);
        update({ masterLoadError: error });
      }
    })();
  };

  const loadFixedAssets = () => {
    fixedAssetsLoadGeneration += 1;
    const generation = fixedAssetsLoadGeneration;
    const scope = readScope();
    const fiscalPeriodId = scope.fiscalPeriodId;
    if (
      fiscalPeriodId == null ||
      fiscalPeriodId.length === 0 ||
      scope.fiscalPeriodDataPurged
    ) {
      update({ fixedAssets: [], fixedAssetsLoadError: null });
      return;
    }
    const authOperationVersion = app.getState().captureAuthOperationVersion();
    const readVersion = periodVersions.capture(fiscalPeriodId);
    const accountNameById = data.getState().master.accountNameById;
    const isSuperseded = () =>
      generation !== fixedAssetsLoadGeneration ||
      !app.getState().isAuthOperationCurrent(authOperationVersion) ||
      !periodVersions.isCurrent(fiscalPeriodId, readVersion);
    void (async () => {
      try {
        const remote = await backend.fixedAssets.getAll(fiscalPeriodId);
        if (isSuperseded()) return;
        update({
          fixedAssets: remote.map((asset) =>
            mapFixedAsset(
              asset,
              accountNameById[asset.bookAccountId] ?? null,
              scope.previewAsOf,
              scope.fiscalPeriodEndDate,
            ),
          ),
          fixedAssetsLoadError: null,
        });
      } catch (error) {
        if (isSuperseded()) return;
        console.error("[openkk] fixed assets load failed:", error);
        update({ fixedAssetsLoadError: error });
      }
    })();
  };

  const followDependencies = () => {
    const appState = app.getState();
    const current = data.getState();
    if (
      current.fiscalPeriods !== appState.fiscalPeriods ||
      current.currentFiscalPeriodId !== appState.currentFiscalPeriodId
    ) {
      update({
        fiscalPeriods: appState.fiscalPeriods,
        currentFiscalPeriodId: appState.currentFiscalPeriodId,
      });
    }
    const previous = followedScope;
    const next = readScope();
    followedScope = next;
    if (!started) return;
    if (next.sessionUserId !== previous.sessionUserId) loadMaster();
    if (
      next.fiscalPeriodId !== previous.fiscalPeriodId ||
      next.fiscalPeriodEndDate !== previous.fiscalPeriodEndDate ||
      next.fiscalPeriodDataPurged !== previous.fiscalPeriodDataPurged ||
      next.previewAsOf.getTime() !== previous.previewAsOf.getTime()
    ) {
      loadFixedAssets();
    }
  };
  app.subscribe(followDependencies);
  today.subscribe(followDependencies);

  const requireAccountId = (
    operation: string,
    accountId: string | null,
  ): string => {
    if (accountId != null) return accountId;
    throw new AppError({
      messageForDeveloper: `${operation}: accountId missing`,
      messageForUser: "勘定科目が解決できないため保存できませんでした",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  };

  const isSelectedFiscalPeriod = (fiscalPeriodId: string) =>
    app.getState().currentFiscalPeriodId === fiscalPeriodId;

  const actions = {
    async addFixedAsset(draft: FixedAssetDraft) {
      assertEditingUnlocked(config.editingPolicy, "assist.addFixedAsset");
      const appState = app.getState();
      const authOperationVersion = appState.captureAuthOperationVersion();
      const fiscalPeriodId = appState.currentFiscalPeriodId;
      if (fiscalPeriodId == null) return null;
      periodVersions.invalidate(fiscalPeriodId);
      const accountId = requireAccountId(
        "assist.addFixedAsset",
        resolveFixedAssetAccountId(
          null,
          draft.account,
          data.getState().master.accounts,
        ),
      );
      try {
        const created = await backend.fixedAssets.create(fiscalPeriodId, {
          name: draft.name,
          acquisitionDate: draft.acquisitionDate,
          acquisitionCost: parseAmount(draft.acquisitionCost),
          usefulLife: Math.max(
            MINIMUM_USEFUL_LIFE_YEARS,
            Math.round(draft.usefulLife) || MINIMUM_USEFUL_LIFE_YEARS,
          ),
          depreciationMethod: "straight_line",
          businessRate: fixedAssetDraftBusinessRate(draft),
          bookAccountId: accountId,
        });
        app.getState().assertAuthOperationCurrent(authOperationVersion);
        if (isSelectedFiscalPeriod(fiscalPeriodId)) {
          const mapped = mapStoredFixedAsset(created);
          updateFixedAssets((assets) => upsertFixedAsset(assets, mapped));
        }
        return created.id;
      } finally {
        periodVersions.invalidate(fiscalPeriodId);
      }
    },
    async updateFixedAsset(assetId: string, draft: FixedAssetDraft) {
      assertEditingUnlocked(config.editingPolicy, "assist.updateFixedAsset");
      const appState = app.getState();
      const authOperationVersion = appState.captureAuthOperationVersion();
      const { fixedAssets, master } = data.getState();
      const current = fixedAssets.find((asset) => asset.id === assetId) ?? null;
      const fiscalPeriodId =
        current?.fiscalPeriodId ?? appState.currentFiscalPeriodId;
      if (fiscalPeriodId == null) return false;
      const accountId = requireAccountId(
        "assist.updateFixedAsset",
        resolveFixedAssetAccountId(
          current == null
            ? null
            : {
                accountId: current.bookAccountId,
                accountName: current.accountName,
              },
          draft.account,
          master.accounts,
        ),
      );
      return await assetMutationQueue.run(assetId, async () => {
        app.getState().assertAuthOperationCurrent(authOperationVersion);
        periodVersions.invalidate(fiscalPeriodId);
        try {
          const patched = await backend.fixedAssets.patch(
            fiscalPeriodId,
            assetId,
            fixedAssetDraftToPatch(draft, accountId),
          );
          app.getState().assertAuthOperationCurrent(authOperationVersion);
          if (isSelectedFiscalPeriod(fiscalPeriodId)) {
            const mapped = mapStoredFixedAsset(patched);
            updateFixedAssets((assets) => upsertFixedAsset(assets, mapped));
          }
          return true;
        } finally {
          periodVersions.invalidate(fiscalPeriodId);
        }
      });
    },
    async deleteFixedAsset(assetId: string) {
      assertEditingUnlocked(config.editingPolicy, "assist.deleteFixedAsset");
      const appState = app.getState();
      const authOperationVersion = appState.captureAuthOperationVersion();
      const current =
        data.getState().fixedAssets.find((asset) => asset.id === assetId) ??
        null;
      const fiscalPeriodId =
        current?.fiscalPeriodId ?? appState.currentFiscalPeriodId;
      if (fiscalPeriodId == null) return false;
      return await assetMutationQueue.run(assetId, async () => {
        app.getState().assertAuthOperationCurrent(authOperationVersion);
        periodVersions.invalidate(fiscalPeriodId);
        try {
          await backend.fixedAssets.remove(fiscalPeriodId, assetId);
          app.getState().assertAuthOperationCurrent(authOperationVersion);
          if (isSelectedFiscalPeriod(fiscalPeriodId)) {
            updateFixedAssets((assets) =>
              assets.filter((asset) => asset.id !== assetId),
            );
          }
          return true;
        } finally {
          periodVersions.invalidate(fiscalPeriodId);
        }
      });
    },
    async addOpeningCarryover(
      fiscalPeriodId: string,
      draft: OpeningCarryoverDraft,
    ) {
      assertEditingUnlocked(config.editingPolicy, "assist.addOpeningCarryover");
      const master = data.getState().master;
      let nextId: string | null = null;
      const updated = await app
        .getState()
        .updateFiscalPeriod(fiscalPeriodId, (currentPeriod) => {
          const currentOpening = currentPeriod.opening;
          const generatedId = nextOpeningCarryoverId(
            fiscalPeriodId,
            currentOpening.journals,
          );
          nextId = generatedId;
          const lines = buildOpeningJournalLines(
            generatedId,
            draft,
            master,
            unresolvedOpeningCarryoverAccount("assist.addOpeningCarryover"),
          );
          const newJournal = {
            id: generatedId,
            date: draft.date,
            description: draft.description,
            businessRate: draftBusinessRate(draft),
            lines,
          };
          return {
            opening: {
              balanceLines: currentOpening.balanceLines,
              journals: [...currentOpening.journals, newJournal],
            },
          };
        });
      return updated ? nextId : null;
    },
    async updateOpeningCarryover(
      carryoverId: string,
      draft: OpeningCarryoverDraft,
    ) {
      assertEditingUnlocked(
        config.editingPolicy,
        "assist.updateOpeningCarryover",
      );
      const appState = app.getState();
      const fiscalPeriodId = appState.currentFiscalPeriodId;
      if (fiscalPeriodId == null) return false;
      const master = data.getState().master;
      return await appState.updateFiscalPeriod(
        fiscalPeriodId,
        (currentPeriod) => {
          const currentOpening = currentPeriod.opening;
          const journals = currentOpening.journals;
          const target = journals.find((journal) => journal.id === carryoverId);
          if (target == null) return null;
          const lines = buildOpeningJournalLines(
            target.id,
            draft,
            master,
            unresolvedOpeningCarryoverAccount("assist.updateOpeningCarryover"),
          );
          const nextJournal = {
            ...target,
            date: draft.date,
            description: draft.description,
            businessRate: draftBusinessRate(draft),
            lines,
          };
          return {
            opening: {
              balanceLines: currentOpening.balanceLines,
              journals: journals.map((journal) =>
                journal.id === carryoverId ? nextJournal : journal,
              ),
            },
          };
        },
      );
    },
    async deleteOpeningCarryover(carryoverId: string) {
      assertEditingUnlocked(
        config.editingPolicy,
        "assist.deleteOpeningCarryover",
      );
      const appState = app.getState();
      const fiscalPeriodId = appState.currentFiscalPeriodId;
      if (fiscalPeriodId == null) return false;
      return await appState.updateFiscalPeriod(
        fiscalPeriodId,
        (currentPeriod) => {
          const currentOpening = currentPeriod.opening;
          const journals = currentOpening.journals;
          const nextJournals = journals.filter(
            (journal) => journal.id !== carryoverId,
          );
          if (nextJournals.length === journals.length) return null;
          return {
            opening: {
              balanceLines: currentOpening.balanceLines,
              journals: nextJournals,
            },
          };
        },
      );
    },
    reload() {
      loadMaster();
      loadFixedAssets();
    },
  };

  const view = deriveState(data, (current): AssistState => {
    const { fixedAssets, master, fiscalPeriods, currentFiscalPeriodId } =
      current;
    const toCarryoverRecord = (
      journal: FiscalPeriod["opening"]["journals"][number],
      fiscalPeriodId: string,
    ) =>
      mapOpeningJournalToRecord(
        journal,
        fiscalPeriodId,
        master.accountNameById,
        master.accountTypeById,
        master.taxCategoryNameById,
        master.businessCategoryNameById,
      );
    return {
      listFixedAssets: (fiscalPeriodId) =>
        listFixedAssetsForPeriod(fixedAssets, fiscalPeriodId),
      getFixedAsset: (assetId) =>
        fixedAssets.find((asset) => asset.id === assetId) ?? null,
      listOpeningCarryovers(fiscalPeriodId) {
        const period = fiscalPeriods.find(
          (candidate) => candidate.id === fiscalPeriodId,
        );
        const journals = period?.opening.journals ?? [];
        return journals
          .map((journal) => toCarryoverRecord(journal, fiscalPeriodId))
          .sort((left, right) => {
            const byDate = left.date.localeCompare(right.date);
            if (byDate !== 0) return byDate;
            return left.id.localeCompare(right.id);
          });
      },
      getOpeningCarryover(carryoverId) {
        const period = fiscalPeriods.find(
          (candidate) => candidate.id === currentFiscalPeriodId,
        );
        const journal = period?.opening.journals.find(
          (item) => item.id === carryoverId,
        );
        if (period == null || journal == null) return null;
        return toCarryoverRecord(journal, period.id);
      },
      loadError: current.masterLoadError ?? current.fixedAssetsLoadError,
      ...actions,
    };
  });

  return {
    getState: view.getState,
    subscribe: view.subscribe,
    start() {
      started = true;
      followedScope = readScope();
      loadMaster();
      loadFixedAssets();
      return () => {
        started = false;
        masterLoadGeneration += 1;
        fixedAssetsLoadGeneration += 1;
      };
    },
  };
}

function unresolvedOpeningCarryoverAccount(
  operation: string,
): UnresolvedAccountMessages {
  return {
    messageForDeveloper: `${operation}: account resolution failed`,
    messageForUser: "勘定科目が解決できないため保存できませんでした",
  };
}
