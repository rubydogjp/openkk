import { describe, expect, it } from "vitest";

import { createOpenkkServer } from "./index";
import type {
  ClosingApiRecord,
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";

describe("openkk server entries API", () => {
  it("rejects invalid entry dates before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-02-29",
        description: "不正日付の仕訳",
        localId: "bad-date",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
        ],
      }),
    ).rejects.toThrow(/Entry date is invalid/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects invalid entry numbers before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "不正金額の仕訳",
        localId: "bad-amount",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: Infinity,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
        ],
      }),
    ).rejects.toThrow(/Entry line amount must be a non-negative finite number/);

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "不正事業割合の仕訳",
        localId: "bad-rate",
        businessRate: 1.5,
        lines: [],
      }),
    ).rejects.toThrow(/Entry business rate must be between 0 and 1/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects unbalanced entries before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "貸借不一致の仕訳",
        localId: "unbalanced",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 1000,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
          {
            side: "credit",
            bookAccountId: "acct_sales",
            amount: 900,
            partnerName: "",
            taxCategoryId: "tax_exempt",
            businessCategoryId: "biz_none",
          },
        ],
      }),
    ).rejects.toThrow(/debit total \(1000\) must equal credit total \(900\)/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects invalid dates in bulk import before persisting", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.importMany("fp-1", [
        {
          date: "2026-04-01",
          description: "valid",
          localId: "valid",
          businessRate: 1,
          lines: [],
        },
        {
          date: "2026-13-01",
          description: "invalid",
          localId: "invalid",
          businessRate: 1,
          lines: [],
        },
      ]),
    ).rejects.toThrow(/Entry date is invalid/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("rejects entry creation in archived fiscal periods", async () => {
    const db = createEntryDb({ archiveStatus: "archived" });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.entries.create("fp-1", {
        date: "2026-04-01",
        description: "archived",
        localId: "archived-entry",
        businessRate: 1,
        lines: [],
      }),
    ).rejects.toThrow(/Archived fiscal period fp-1 cannot create entry/);

    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });

  it("deletes an entry only when it belongs to the requested fiscal period", async () => {
    const db = createEntryDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.entries.create("fp-1", {
      date: "2026-04-01",
      description: "削除対象の仕訳",
      localId: "delete-target",
      businessRate: 1,
      lines: [
        {
          side: "debit",
          bookAccountId: "acct_cash",
          amount: 1000,
          partnerName: "",
          taxCategoryId: "tax_exempt",
          businessCategoryId: "biz_none",
        },
        {
          side: "credit",
          bookAccountId: "acct_sales",
          amount: 1000,
          partnerName: "",
          taxCategoryId: "tax_exempt",
          businessCategoryId: "biz_none",
        },
      ],
    });

    await expect(server.entries.remove("fp-other", created.id)).rejects.toThrow(
      /Fiscal period fp-other not found/,
    );
    expect(await server.entries.getAll("fp-1")).toHaveLength(1);

    await server.entries.remove("fp-1", created.id);
    expect(await server.entries.getAll("fp-1")).toEqual([]);
  });
});

function createEntryDb(
  fiscalPeriodOverrides: Partial<FiscalPeriodApiRecord> = {},
): OpenkkDbPort {
  const entries = new Map<string, EntryApiRecord>();
  return {
    fiscalPeriods: {
      async getAllByUser() {
        return [fiscalPeriod({ id: "fp-1", ...fiscalPeriodOverrides })];
      },
      async getById() {
        return null;
      },
      async create(_userId: string, input: FiscalPeriodCreateInput) {
        return fiscalPeriod({ ...input, id: "fp-1" });
      },
      async importArchived() {
        return fiscalPeriod({ id: "fp-archive", archiveStatus: "archived" });
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        return fiscalPeriod({ id, ...patch });
      },
      async archive(id: string) {
        return fiscalPeriod({ id, archiveStatus: "archived" });
      },
      async delete() {},
    },
    entries: {
      async getAll(fiscalPeriodId) {
        return [...entries.values()].filter(
          (entry) => entry.fiscalPeriodId === fiscalPeriodId,
        );
      },
      async getById(id) {
        return entries.get(id) ?? null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: EntryUpsertInput,
      ) {
        const record = entry({
          id: `entry-${entries.size + 1}`,
          fiscalPeriodId,
          ...input,
        });
        entries.set(record.id, record);
        return record;
      },
      async update(id: string, input: EntryUpsertInput) {
        const current = entries.get(id);
        if (current == null) throw new Error(`entry not found: ${id}`);
        const updated = entry({ ...current, ...input });
        entries.set(id, updated);
        return updated;
      },
      async delete(id: string) {
        entries.delete(id);
      },
      async importMany(
        _userId: string,
        fiscalPeriodId: string,
        inputs: EntryUpsertInput[],
      ) {
        return inputs.map((input, index) =>
          entry({ id: `entry-${index + 1}`, fiscalPeriodId, ...input }),
        );
      },
    },
    fixedAssets: {
      async getAllByFiscalPeriod() {
        return [];
      },
      async getById() {
        return null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: FixedAssetCreateInput,
      ) {
        return fixedAsset({ id: "asset-1", fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, fiscalPeriodId: "fp-1", ...patch });
      },
      async delete() {},
    },
    preClosings: {
      async get() {
        return null;
      },
      async run() {
        return fiscalPeriod({ phase: "pre_closing" });
      },
      async cancel() {
        return fiscalPeriod({ phase: "journalizing" });
      },
    },
    closings: {
      async get(): Promise<ClosingApiRecord | null> {
        return null;
      },
      async run() {
        return fiscalPeriod({ phase: "post_closing" });
      },
    },
    masterData: {
      async getAllBookAccounts(): Promise<MasterBookAccount[]> {
        return [];
      },
      async getAllTaxCategories(): Promise<MasterTaxCategory[]> {
        return [];
      },
      async getAllBusinessCategories(): Promise<MasterBusinessCategory[]> {
        return [];
      },
    },
  };
}

function fiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  return {
    id: "fp-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: null,
    ...overrides,
  };
}

function entry(overrides: Partial<EntryApiRecord>): EntryApiRecord {
  return {
    id: "entry-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "entry",
    localId: "",
    businessRate: 1,
    lines: [],
    ...overrides,
  };
}

function fixedAsset(
  overrides: Partial<FixedAssetApiRecord>,
): FixedAssetApiRecord {
  return {
    id: "asset-1",
    fiscalPeriodId: "fp-1",
    name: "asset",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 0,
    usefulLife: 0,
    depreciationMethod: "straight_line",
    businessRate: 1,
    status: "active",
    disposalDate: "",
    disposalPrice: 0,
    bookAccountId: "",
    ...overrides,
  };
}
