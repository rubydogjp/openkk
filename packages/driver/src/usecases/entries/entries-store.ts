import {
  AppError,
  draftBusinessRate,
  entryLinesToInputs,
  recordToPreviewRows,
  storedEntryToRecord,
  type EntryLine,
  type EntryPreviewRow,
  type EntryRecord,
  type JournalTableChanges,
  type JournalTableMaster,
  type OpenkkConfig,
} from "../../domain/index.js";
import {
  loadEntryRecords,
  loadJournalMaster,
  type LoadedJournalMaster,
} from "../records/load-records.js";
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
  buildEntryMasterAccountOptions,
  type EntryMasterAccountOption,
} from "./account-options.js";
import {
  applyJournalTableChanges,
  importEntryRecords,
} from "./entry-operations.js";
import {
  removeEntryRecord,
  replaceFiscalPeriodEntryRecords,
  upsertEntryRecord,
} from "./entry-record-state.js";

const MAX_RELOAD_ATTEMPTS = 3;

export type EntryDraft = {
  date: string;
  description: string;
  businessRateInput: string;
  businessRate: number | null;
  lines: EntryLine[];
};

export type EntryMasterCategoryOption = { id: string; name: string };

export type EntrySuggestions = {
  partner: string[];
  taxCategory: string[];
  businessCategory: string[];
};

export type EntriesState = {
  listFiscalPeriodEntries: (fiscalPeriodId: string) => EntryRecord[];
  loadFiscalPeriodEntries: (fiscalPeriodId: string) => Promise<EntryRecord[]>;
  listMonthRows: (
    fiscalPeriodId: string,
    yearMonth: string,
  ) => EntryPreviewRow[];
  getEntry: (entryId: string) => EntryRecord | null;
  createEntryFromDraft: (
    fiscalPeriodId: string,
    draft: EntryDraft,
  ) => Promise<string>;
  saveEntry: (entryId: string, draft: EntryDraft) => Promise<boolean>;
  deleteEntry: (entryId: string) => Promise<boolean>;
  mergeFiscalPeriodEntries: (
    fiscalPeriodId: string,
    importedEntries: EntryRecord[],
  ) => Promise<{
    imported: number;
    skipped: number;
  }>;
  journalTableMaster: JournalTableMaster;
  applyJournalTableChanges: (
    fiscalPeriodId: string,
    changes: JournalTableChanges,
  ) => Promise<void>;

  accountOptions: EntryMasterAccountOption[];
  taxCategoryOptions: EntryMasterCategoryOption[];
  businessCategoryOptions: EntryMasterCategoryOption[];

  listSuggestions: (fiscalPeriodId: string) => EntrySuggestions;

  loadError: unknown;
  reload: () => void;
  reloadAndWait: () => Promise<EntryRecord[]>;
};

export type OpenkkEntriesStore = ReadableState<EntriesState> & {
  start(): () => void;
};

type EntriesData = {
  records: EntryRecord[];
  master: LoadedJournalMaster;
  masterLoadError: unknown;
  entriesLoadError: unknown;
};

type AppSelection = {
  sessionUserId: string | null;
  currentFiscalPeriodId: string | null;
  currentFiscalPeriodDataPurged: boolean;
};

export function createOpenkkEntriesStore(dependencies: {
  config: OpenkkConfig;
  app: OpenkkAppStore;
}): OpenkkEntriesStore {
  const { config, app } = dependencies;
  const backend = app.backend;
  const periodVersions = new KeyedAsyncStateVersion<string>();
  const entryMutationQueue = new KeyedAsyncMutationQueue<string>();
  const data = createWritableState<EntriesData>({
    records: [],
    master: { accounts: [], taxCategories: [], businessCategories: [] },
    masterLoadError: null,
    entriesLoadError: null,
  });
  let started = false;
  let followedSelection = readAppSelection(app);
  let masterLoadGeneration = 0;
  let entriesLoadGeneration = 0;

  const update = (patch: Partial<EntriesData>) => {
    data.setState({ ...data.getState(), ...patch });
  };

  const updateRecords = (change: (records: EntryRecord[]) => EntryRecord[]) => {
    update({ records: change(data.getState().records) });
  };

  const appState = () => app.getState();

  const loadMaster = () => {
    masterLoadGeneration += 1;
    const generation = masterLoadGeneration;
    if (readAppSelection(app).sessionUserId == null) {
      update({ masterLoadError: null });
      return;
    }
    void (async () => {
      try {
        const master = await loadJournalMaster(backend);
        if (generation !== masterLoadGeneration) return;
        update({ master, masterLoadError: null });
        loadEntries();
      } catch (error) {
        if (generation !== masterLoadGeneration) return;
        console.error("[openkk] master data load failed:", error);
        update({ masterLoadError: error });
      }
    })();
  };

  const loadEntries = () => {
    entriesLoadGeneration += 1;
    const generation = entriesLoadGeneration;
    const selection = readAppSelection(app);
    const fiscalPeriodId = selection.currentFiscalPeriodId;
    if (
      fiscalPeriodId == null ||
      fiscalPeriodId.length === 0 ||
      selection.currentFiscalPeriodDataPurged
    ) {
      update({ records: [], entriesLoadError: null });
      return;
    }
    const authOperationVersion = appState().captureAuthOperationVersion();
    const readVersion = periodVersions.capture(fiscalPeriodId);
    const master = data.getState().master;
    const isSuperseded = () =>
      generation !== entriesLoadGeneration ||
      !appState().isAuthOperationCurrent(authOperationVersion) ||
      !periodVersions.isCurrent(fiscalPeriodId, readVersion);
    void (async () => {
      try {
        const remoteEntries = await backend.entries.getAll(fiscalPeriodId);
        if (isSuperseded()) return;
        const loaded = remoteEntries.map((entry) =>
          storedEntryToRecord(entry, fiscalPeriodId, master),
        );
        update({
          records: replaceFiscalPeriodEntryRecords(
            data.getState().records,
            fiscalPeriodId,
            loaded,
          ),
          entriesLoadError: null,
        });
      } catch (error) {
        if (isSuperseded()) return;
        console.error("[openkk] entries load failed:", error);
        update({ entriesLoadError: error });
      }
    })();
  };

  const followAppSelection = () => {
    const next = readAppSelection(app);
    const previous = followedSelection;
    followedSelection = next;
    if (!started) return;
    if (next.sessionUserId !== previous.sessionUserId) loadMaster();
    if (
      next.currentFiscalPeriodId !== previous.currentFiscalPeriodId ||
      next.currentFiscalPeriodDataPurged !==
        previous.currentFiscalPeriodDataPurged
    ) {
      loadEntries();
    }
  };
  app.subscribe(followAppSelection);

  const actions = {
    async loadFiscalPeriodEntries(fiscalPeriodId: string) {
      return loadEntryRecords(backend, fiscalPeriodId, data.getState().master);
    },
    async createEntryFromDraft(fiscalPeriodId: string, draft: EntryDraft) {
      assertEditingUnlocked(
        config.editingPolicy,
        "entries.createEntryFromDraft",
      );
      const authOperationVersion = appState().captureAuthOperationVersion();
      const master = data.getState().master;
      periodVersions.invalidate(fiscalPeriodId);
      const lines = entryLinesToInputs(draft.lines, master, {
        messageForDeveloper:
          "entries.createEntryFromDraft: bookAccountId resolution failed",
        messageForUser: "勘定科目の解決に失敗したため作成できませんでした",
      });
      try {
        const created = await backend.entries.create(fiscalPeriodId, {
          date: draft.date,
          description: draft.description,
          businessRate: draftBusinessRate(draft),
          lines,
          localId: null,
        });
        appState().assertAuthOperationCurrent(authOperationVersion);
        const mapped = storedEntryToRecord(created, fiscalPeriodId, master);
        updateRecords((records) => upsertEntryRecord(records, mapped));
        return mapped.id;
      } finally {
        periodVersions.invalidate(fiscalPeriodId);
      }
    },
    async saveEntry(entryId: string, draft: EntryDraft) {
      assertEditingUnlocked(config.editingPolicy, "entries.saveEntry");
      const authOperationVersion = appState().captureAuthOperationVersion();
      const { records, master } = data.getState();
      const currentRecord = records.find((record) => record.id === entryId);
      if (currentRecord == null) return false;
      const lines = entryLinesToInputs(draft.lines, master, {
        messageForDeveloper:
          "entries.saveEntry: bookAccountId resolution failed",
        messageForUser: "勘定科目の解決に失敗したため保存できませんでした",
      });
      return await entryMutationQueue.run(entryId, async () => {
        appState().assertAuthOperationCurrent(authOperationVersion);
        periodVersions.invalidate(currentRecord.fiscalPeriodId);
        try {
          const updated = await backend.entries.update(
            currentRecord.fiscalPeriodId,
            entryId,
            {
              date: draft.date,
              description: draft.description,
              localId: currentRecord.localId,
              businessRate: draftBusinessRate(draft),
              lines,
            },
          );
          appState().assertAuthOperationCurrent(authOperationVersion);
          const mapped = storedEntryToRecord(
            updated,
            currentRecord.fiscalPeriodId,
            master,
          );
          updateRecords((current) => upsertEntryRecord(current, mapped));
          return true;
        } finally {
          periodVersions.invalidate(currentRecord.fiscalPeriodId);
        }
      });
    },
    async deleteEntry(entryId: string) {
      assertEditingUnlocked(config.editingPolicy, "entries.deleteEntry");
      const authOperationVersion = appState().captureAuthOperationVersion();
      const currentRecord = data
        .getState()
        .records.find((record) => record.id === entryId);
      if (currentRecord == null) return false;
      return await entryMutationQueue.run(entryId, async () => {
        appState().assertAuthOperationCurrent(authOperationVersion);
        periodVersions.invalidate(currentRecord.fiscalPeriodId);
        try {
          await backend.entries.remove(currentRecord.fiscalPeriodId, entryId);
          appState().assertAuthOperationCurrent(authOperationVersion);
          updateRecords((current) => removeEntryRecord(current, entryId));
          return true;
        } finally {
          periodVersions.invalidate(currentRecord.fiscalPeriodId);
        }
      });
    },
    async mergeFiscalPeriodEntries(
      fiscalPeriodId: string,
      importedEntries: EntryRecord[],
    ) {
      assertEditingUnlocked(
        config.editingPolicy,
        "entries.mergeFiscalPeriodEntries",
      );
      const authOperationVersion = appState().captureAuthOperationVersion();
      const master = data.getState().master;
      periodVersions.invalidate(fiscalPeriodId);
      try {
        const result = await importEntryRecords(
          backend,
          fiscalPeriodId,
          importedEntries,
          master,
        );
        appState().assertAuthOperationCurrent(authOperationVersion);
        updateRecords((current) =>
          result.records.reduce(upsertEntryRecord, current),
        );
        return { imported: result.imported, skipped: result.skipped };
      } finally {
        periodVersions.invalidate(fiscalPeriodId);
      }
    },
    async applyJournalTableChanges(
      fiscalPeriodId: string,
      changes: JournalTableChanges,
    ) {
      assertEditingUnlocked(
        config.editingPolicy,
        "entries.applyJournalTableChanges",
      );
      const authOperationVersion = appState().captureAuthOperationVersion();
      const assertAuthStillCurrent = () =>
        appState().assertAuthOperationCurrent(authOperationVersion);
      const master = data.getState().master;
      periodVersions.invalidate(fiscalPeriodId);
      try {
        await applyJournalTableChanges(
          backend,
          fiscalPeriodId,
          changes,
          master,
          assertAuthStillCurrent,
        );
        const remoteEntries = await backend.entries.getAll(fiscalPeriodId);
        assertAuthStillCurrent();
        const loaded = remoteEntries.map((entry) =>
          storedEntryToRecord(entry, fiscalPeriodId, master),
        );
        updateRecords((current) =>
          replaceFiscalPeriodEntryRecords(current, fiscalPeriodId, loaded),
        );
      } finally {
        periodVersions.invalidate(fiscalPeriodId);
      }
    },
    reload() {
      loadMaster();
      loadEntries();
    },
    async reloadAndWait() {
      const authOperationVersion = appState().captureAuthOperationVersion();
      const selection = readAppSelection(app);
      const fiscalPeriodId = selection.currentFiscalPeriodId;
      if (fiscalPeriodId == null || selection.currentFiscalPeriodDataPurged) {
        update({ records: [], entriesLoadError: null });
        return [];
      }
      try {
        for (let attempt = 0; attempt < MAX_RELOAD_ATTEMPTS; attempt += 1) {
          const readVersion = periodVersions.capture(fiscalPeriodId);
          const master = data.getState().master;
          const remoteEntries = await backend.entries.getAll(fiscalPeriodId);
          appState().assertAuthOperationCurrent(authOperationVersion);
          if (!periodVersions.isCurrent(fiscalPeriodId, readVersion)) continue;
          const loaded = remoteEntries.map((entry) =>
            storedEntryToRecord(entry, fiscalPeriodId, master),
          );
          update({
            records: replaceFiscalPeriodEntryRecords(
              data.getState().records,
              fiscalPeriodId,
              loaded,
            ),
            entriesLoadError: null,
          });
          return loaded;
        }
        throw new AppError({
          messageForDeveloper:
            "entries.reloadAndWait: entries changed during three reads",
          messageForUser:
            "仕訳が同時に更新されたため読み込み直せませんでした。もう一度お試しください",
          originalMessage: null,
          statusCode: null,
          code: null,
        });
      } catch (error) {
        if (!appState().isAuthOperationCurrent(authOperationVersion))
          throw error;
        update({ entriesLoadError: error });
        throw error;
      }
    },
  };

  const view = deriveState(data, (current): EntriesState => {
    const { records, master } = current;
    const sortedByDate = (selected: EntryRecord[]) =>
      selected.sort((left, right) => left.date.localeCompare(right.date));
    return {
      listFiscalPeriodEntries: (fiscalPeriodId) =>
        sortedByDate(
          records.filter((record) => record.fiscalPeriodId === fiscalPeriodId),
        ),
      listMonthRows: (fiscalPeriodId, yearMonth) =>
        sortedByDate(
          records.filter(
            (record) =>
              record.fiscalPeriodId === fiscalPeriodId &&
              record.date.startsWith(yearMonth),
          ),
        ).flatMap(recordToPreviewRows),
      getEntry: (entryId) =>
        records.find((record) => record.id === entryId) ?? null,
      journalTableMaster: master,
      accountOptions: buildEntryMasterAccountOptions(master.accounts),
      taxCategoryOptions: master.taxCategories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
      businessCategoryOptions: master.businessCategories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
      listSuggestions: (fiscalPeriodId) =>
        collectSuggestions(records, fiscalPeriodId),
      loadError: current.masterLoadError ?? current.entriesLoadError,
      ...actions,
    };
  });

  return {
    getState: view.getState,
    subscribe: view.subscribe,
    start() {
      started = true;
      followedSelection = readAppSelection(app);
      loadMaster();
      loadEntries();
      return () => {
        started = false;
        masterLoadGeneration += 1;
        entriesLoadGeneration += 1;
      };
    },
  };
}

function readAppSelection(app: OpenkkAppStore): AppSelection {
  const appState = app.getState();
  return {
    sessionUserId: appState.session?.user.id ?? null,
    currentFiscalPeriodId: appState.currentFiscalPeriodId,
    currentFiscalPeriodDataPurged:
      appState.currentFiscalPeriod?.archiveStatus === "purged",
  };
}

function collectSuggestions(
  records: ReadonlyArray<EntryRecord>,
  fiscalPeriodId: string,
): EntrySuggestions {
  const partner = new Set<string>();
  const taxCategory = new Set<string>();
  const businessCategory = new Set<string>();
  for (const record of records) {
    if (record.fiscalPeriodId !== fiscalPeriodId) continue;
    for (const line of record.lines) {
      addSuggestion(partner, line.partnerName, null);
      addSuggestion(taxCategory, line.taxCategoryName, line.taxCategoryId);
      addSuggestion(
        businessCategory,
        line.businessCategoryName,
        line.businessCategoryId,
      );
    }
  }
  return {
    partner: Array.from(partner).sort(),
    taxCategory: Array.from(taxCategory).sort(),
    businessCategory: Array.from(businessCategory).sort(),
  };
}

function addSuggestion(
  suggestions: Set<string>,
  preferred: string | null,
  fallback: string | null,
): void {
  const value = preferred ?? fallback;
  if (value == null) return;
  const trimmed = value.trim();
  if (trimmed !== "") suggestions.add(trimmed);
}
