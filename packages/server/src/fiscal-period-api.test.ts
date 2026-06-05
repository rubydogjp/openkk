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

type StoredFiscalPeriodApiRecord = FiscalPeriodApiRecord & { userId: string };

describe("openkk server fiscal period API", () => {
  it("rejects invalid fiscal period dates before persisting", async () => {
    const db = createFiscalPeriodDb([]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.create({
        name: "不正な期間",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }),
    ).rejects.toThrow(/Fiscal period start date must be on or before end date/);

    expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);
  });

  it("patches only fiscal periods owned by the current user", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1", name: "user-1 period" }),
      fiscalPeriod({ id: "fp-user-2", userId: "user-2", name: "user-2 period" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-2", { name: "updated by user-1" }),
    ).rejects.toThrow(/Fiscal period fp-user-2 not found/);

    expect((await db.fiscalPeriods.getById("fp-user-2"))?.name).toBe("user-2 period");

    const updated = await server.fiscalPeriod.patch("fp-user-1", {
      name: "updated by owner",
    });
    expect(updated.name).toBe("updated by owner");
  });

  it("rejects fiscal period patches that would invert the period range", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", { startDate: "2027-01-01" }),
    ).rejects.toThrow(/Fiscal period start date must be on or before end date/);

    expect((await db.fiscalPeriods.getById("fp-user-1"))?.startDate).toBe(
      "2026-01-01",
    );
  });
});

function createFiscalPeriodDb(seed: StoredFiscalPeriodApiRecord[]): OpenkkDbPort {
  const fiscalPeriods = new Map(seed.map((period) => [period.id, period]));
  return {
    fiscalPeriods: {
      async getAllByUser(userId) {
        return [...fiscalPeriods.values()].filter((period) => period.userId === userId);
      },
      async getById(id) {
        return fiscalPeriods.get(id) ?? null;
      },
      async create(userId: string, input: FiscalPeriodCreateInput) {
        const record = fiscalPeriod({ id: `fp-${fiscalPeriods.size + 1}`, userId, ...input });
        fiscalPeriods.set(record.id, record);
        return record;
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const updated = fiscalPeriod({ ...current, ...patch });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async delete(id) {
        fiscalPeriods.delete(id);
      },
    },
    entries: {
      async getAll() {
        return [];
      },
      async getByMonth() {
        return [];
      },
      async getById() {
        return null;
      },
      async create(_userId: string, fiscalPeriodId: string, input: EntryUpsertInput) {
        return entry({ fiscalPeriodId, ...input });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({ id, ...input });
      },
      async delete() {},
      async importMany(_userId: string, fiscalPeriodId: string, inputs: EntryUpsertInput[]) {
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
      async create(_userId: string, fiscalPeriodId: string, input: FixedAssetCreateInput) {
        return fixedAsset({ fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, ...patch });
      },
      async delete() {},
    },
    closings: {
      async get(): Promise<ClosingApiRecord | null> {
        return null;
      },
      async upsert() {},
      async delete() {},
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
  overrides: Partial<StoredFiscalPeriodApiRecord>,
): StoredFiscalPeriodApiRecord {
  return {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "journalizing",
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

function fixedAsset(overrides: Partial<FixedAssetApiRecord>): FixedAssetApiRecord {
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
