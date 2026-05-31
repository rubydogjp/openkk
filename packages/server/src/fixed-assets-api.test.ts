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

describe("openkk server fixed asset API", () => {
  it("deletes a fixed asset only when it belongs to the requested fiscal period", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "削除対象の資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_asset_工具器具備品",
    });

    await expect(server.fixedAssets.delete("fp-other", created.id)).rejects.toThrow(
      /not found in fiscal period/,
    );
    expect(await server.fixedAssets.getAll("fp-1")).toHaveLength(1);

    await server.fixedAssets.delete("fp-1", created.id);
    expect(await server.fixedAssets.getAll("fp-1")).toEqual([]);
  });
});

function createFixedAssetDb(): OpenkkDbPort {
  const fixedAssets = new Map<string, FixedAssetApiRecord>();
  return {
    fiscalPeriods: {
      async getAllByUser() {
        return [];
      },
      async getById() {
        return null;
      },
      async create(_userId: string, input: FiscalPeriodCreateInput) {
        return fiscalPeriod({ ...input, id: "fp-1" });
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        return fiscalPeriod({ id, ...patch });
      },
      async delete() {},
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
        return entry({ id: "entry-1", fiscalPeriodId, ...input });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({ id, fiscalPeriodId: "fp-1", ...input });
      },
      async delete() {},
      async importMany(_userId: string, fiscalPeriodId: string, inputs: EntryUpsertInput[]) {
        return inputs.map((input, index) =>
          entry({ id: `entry-${index + 1}`, fiscalPeriodId, ...input }),
        );
      },
    },
    fixedAssets: {
      async getAllByFiscalPeriod(fiscalPeriodId) {
        return [...fixedAssets.values()].filter(
          (asset) => asset.fiscalPeriodId === fiscalPeriodId,
        );
      },
      async getById(id) {
        return fixedAssets.get(id) ?? null;
      },
      async create(_userId: string, fiscalPeriodId: string, input: FixedAssetCreateInput) {
        const record = fixedAsset({
          id: `asset-${fixedAssets.size + 1}`,
          fiscalPeriodId,
          ...input,
        });
        fixedAssets.set(record.id, record);
        return record;
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        const current = fixedAssets.get(id);
        if (current == null) throw new Error(`fixed asset not found: ${id}`);
        const updated = fixedAsset({ ...current, ...patch });
        fixedAssets.set(id, updated);
        return updated;
      },
      async delete(id: string) {
        fixedAssets.delete(id);
      },
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
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  return {
    id: "fp-1",
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
