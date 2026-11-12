import {
  createFixedClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  type OpenkkConfig,
} from "../src/domain/index.js";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
  MaintenanceStatus,
  MasterBookAccountApiRecord,
  OpenkkBackendPort,
  PlatformKeyValueStorage,
} from "../src/ports/index.js";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";
export const FAKE_USER_ID = "user-1";
export const FAKE_TODAY = new Date(2026, 5, 15);

export const FAKE_ACCOUNTS: MasterBookAccountApiRecord[] = [
  fakeAccount("acct_cash", "現金", "asset", "current_asset"),
  fakeAccount("acct_equipment", "工具器具備品", "asset", "fixed_asset"),
  fakeAccount("acct_sales", "売上高", "revenue", "none"),
];

function fakeAccount(
  id: string,
  name: string,
  accountType: MasterBookAccountApiRecord["accountType"],
  balanceSheetSection: MasterBookAccountApiRecord["balanceSheetSection"],
): MasterBookAccountApiRecord {
  return {
    id,
    name,
    description: "",
    kana: "",
    normalBalanceSide: accountType === "asset" ? "debit" : "credit",
    accountType,
    balanceSheetSection,
    sortOrder: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

export function fakeFiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  return {
    id: "fp-1",
    userId: FAKE_USER_ID,
    name: "2026年",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    archivedAt: null,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: { balanceLines: [], journals: [] },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function fakeConfig(overrides: Partial<OpenkkConfig>): OpenkkConfig {
  return {
    clock: createFixedClock(FAKE_TODAY),
    bundleLabel: "テスト",
    authMode: "embedded",
    embeddedUser: { kind: "embedded", id: FAKE_USER_ID, displayName: "利用者" },
    initialFiscalPeriodId: null,
    sessionStorageKey: "test.session",
    fiscalPeriodStorageKey: "test.fiscal_period_id",
    fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
    editingPolicy: DEFAULT_EDITING_POLICY,
    debugRoutesEnabled: false,
    myPagePath: null,
    ...overrides,
  };
}

export type FakeStorage = PlatformKeyValueStorage & {
  items: Map<string, string>;
};

export function fakeStorage(initial: Record<string, string>): FakeStorage {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

export type FakeBackend = {
  backend: OpenkkBackendPort;
  fiscalPeriods: FiscalPeriodApiRecord[];
  entries: EntryApiRecord[];
  fixedAssets: FixedAssetApiRecord[];
  maintenance: { status: MaintenanceStatus };
  calls: string[];
  rejectNext(call: string, error: unknown): void;
  holdNext(call: string): () => void;
};

export function fakeBackend(): FakeBackend {
  const fiscalPeriods: FiscalPeriodApiRecord[] = [];
  const entries: EntryApiRecord[] = [];
  const fixedAssets: FixedAssetApiRecord[] = [];
  const maintenance = {
    status: { enabled: false, title: "", message: "", updatedAt: null },
  };
  const calls: string[] = [];
  const rejections = new Map<string, unknown>();
  const holds = new Map<string, Promise<void>>();
  let sequence = 0;
  const nextId = (prefix: string) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };

  const respond = async <Result>(
    call: string,
    result: () => Result,
  ): Promise<Result> => {
    calls.push(call);
    const hold = holds.get(call);
    if (hold != null) {
      holds.delete(call);
      await hold;
    }
    if (rejections.has(call)) {
      const error = rejections.get(call);
      rejections.delete(call);
      throw error;
    }
    return result();
  };

  const requirePeriod = (id: string) => {
    const period = fiscalPeriods.find((candidate) => candidate.id === id);
    if (period == null) throw new Error(`fake backend: no fiscal period ${id}`);
    return period;
  };

  const replacePeriod = (
    id: string,
    patch: Partial<FiscalPeriodApiRecord>,
  ): FiscalPeriodApiRecord => {
    const updated = { ...requirePeriod(id), ...patch };
    fiscalPeriods.splice(
      fiscalPeriods.findIndex((candidate) => candidate.id === id),
      1,
      updated,
    );
    return updated;
  };

  const storeEntry = (
    fiscalPeriodId: string,
    id: string,
    input: EntryUpsertInput,
  ): EntryApiRecord => ({
    id,
    userId: FAKE_USER_ID,
    fiscalPeriodId,
    date: input.date,
    description: input.description,
    localId: input.localId,
    businessRate: input.businessRate,
    lines: input.lines.map((line, index) => ({
      ...line,
      id: `${id}-line-${index + 1}`,
    })),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  const unsupported = (call: string) => () =>
    Promise.reject(new Error(`fake backend: ${call} is not supported`));

  const backend: OpenkkBackendPort = {
    auth: {
      startSession: (redirectUrl) =>
        respond("auth.startSession", () => ({
          authUrl: `https://auth.example/?redirect=${redirectUrl}`,
        })),
      completeSession: () =>
        respond("auth.completeSession", () => ({ completionCode: "code-1" })),
      redeemCompletionCode: () =>
        respond("auth.redeemCompletionCode", () => ({
          userId: "custom-1",
          displayName: "サインインした人",
          email: null,
          iconUrl: null,
          authProvider: "google",
        })),
      signOut: () => respond("auth.signOut", () => {}),
    },
    preClosings: {
      run: (id) =>
        respond("preClosings.run", () =>
          replacePeriod(id, { phase: "pre_closing" }),
        ),
      cancel: (id) =>
        respond("preClosings.cancel", () =>
          replacePeriod(id, { phase: "journalizing" }),
        ),
    },
    closings: {
      run: (id) =>
        respond("closings.run", () =>
          replacePeriod(id, { phase: "post_closing" }),
        ),
    },
    entries: {
      getAll: (fiscalPeriodId) =>
        respond("entries.getAll", () =>
          entries.filter((entry) => entry.fiscalPeriodId === fiscalPeriodId),
        ),
      create: (fiscalPeriodId, input) =>
        respond("entries.create", () => {
          const created = storeEntry(fiscalPeriodId, nextId("entry"), input);
          entries.push(created);
          return created;
        }),
      update: (fiscalPeriodId, id, input) =>
        respond("entries.update", () => {
          const updated = storeEntry(fiscalPeriodId, id, input);
          entries.splice(
            entries.findIndex((entry) => entry.id === id),
            1,
            updated,
          );
          return updated;
        }),
      remove: (_fiscalPeriodId, id) =>
        respond("entries.remove", () => {
          entries.splice(
            entries.findIndex((entry) => entry.id === id),
            1,
          );
        }),
      importMany: (fiscalPeriodId, inputs) =>
        respond("entries.importMany", () => {
          const created = inputs.map((input) =>
            storeEntry(fiscalPeriodId, nextId("entry"), input),
          );
          entries.push(...created);
          return { importedCount: created.length, entries: created };
        }),
    },
    fiscalPeriods: {
      getAll: () => respond("fiscalPeriods.getAll", () => [...fiscalPeriods]),
      create: (input) =>
        respond("fiscalPeriods.create", () => {
          const created = fakeFiscalPeriod({
            id: nextId("fp"),
            phase: "pre_opening",
            ...input,
          });
          fiscalPeriods.push(created);
          return created;
        }),
      createNext: unsupported("fiscalPeriods.createNext"),
      applyCarryover: unsupported("fiscalPeriods.applyCarryover"),
      applyCarryoverFromArchive: unsupported(
        "fiscalPeriods.applyCarryoverFromArchive",
      ),
      importArchived: unsupported("fiscalPeriods.importArchived"),
      start: (id) =>
        respond("fiscalPeriods.start", () =>
          replacePeriod(id, { phase: "journalizing" }),
        ),
      archive: (id) =>
        respond("fiscalPeriods.archive", () =>
          replacePeriod(id, { archiveStatus: "archived" }),
        ),
      purgeArchivedData: (id) =>
        respond("fiscalPeriods.purgeArchivedData", () =>
          replacePeriod(id, { archiveStatus: "purged" }),
        ),
      patch: (id, patch) =>
        respond("fiscalPeriods.patch", () => replacePeriod(id, patch)),
      remove: (id) =>
        respond("fiscalPeriods.remove", () => {
          fiscalPeriods.splice(
            fiscalPeriods.findIndex((candidate) => candidate.id === id),
            1,
          );
        }),
    },
    fixedAssets: {
      getAll: (fiscalPeriodId) =>
        respond("fixedAssets.getAll", () =>
          fixedAssets.filter(
            (asset) => asset.fiscalPeriodId === fiscalPeriodId,
          ),
        ),
      create: (fiscalPeriodId, input) =>
        respond("fixedAssets.create", () => {
          const created: FixedAssetApiRecord = {
            ...input,
            id: nextId("asset"),
            userId: FAKE_USER_ID,
            fiscalPeriodId,
            status: "active",
            disposalDate: null,
            disposalPrice: null,
            createdAt: TIMESTAMP,
            updatedAt: TIMESTAMP,
          };
          fixedAssets.push(created);
          return created;
        }),
      patch: (_fiscalPeriodId, id, patch) =>
        respond("fixedAssets.patch", () => {
          const index = fixedAssets.findIndex((asset) => asset.id === id);
          const updated = { ...fixedAssets[index]!, ...patch };
          fixedAssets.splice(index, 1, updated);
          return updated;
        }),
      remove: (_fiscalPeriodId, id) =>
        respond("fixedAssets.remove", () => {
          fixedAssets.splice(
            fixedAssets.findIndex((asset) => asset.id === id),
            1,
          );
        }),
    },
    masterData: {
      getBookAccounts: () =>
        respond("masterData.getBookAccounts", () => FAKE_ACCOUNTS),
      getTaxCategories: () =>
        respond("masterData.getTaxCategories", () => [
          {
            id: "tax_out_of_scope",
            name: "対象外",
            rate: 0,
            createdAt: TIMESTAMP,
            updatedAt: TIMESTAMP,
          },
        ]),
      getBusinessCategories: () =>
        respond("masterData.getBusinessCategories", () => [
          {
            id: "biz_none",
            name: "対象外",
            createdAt: TIMESTAMP,
            updatedAt: TIMESTAMP,
          },
        ]),
    },
    maintenance: {
      get: () => respond("maintenance.get", () => maintenance.status),
    },
  };

  return {
    backend,
    fiscalPeriods,
    entries,
    fixedAssets,
    maintenance,
    calls,
    rejectNext(call, error) {
      rejections.set(call, error);
    },
    holdNext(call) {
      let release = () => {};
      holds.set(
        call,
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      return () => release();
    },
  };
}

export async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
