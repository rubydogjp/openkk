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

describe("openkk server closing flow", () => {
  it("persists provisional, final, and cancelled closing records", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });

    expect(await server.closing.get("fp-1", 2026)).toBeNull();

    await server.closing.run({
      fiscalPeriodId: "fp-1",
      year: 2026,
      isProvisional: true,
    });
    expect(await server.closing.get("fp-1", 2026)).toEqual({
      isProvisional: true,
    });

    await server.closing.run({
      fiscalPeriodId: "fp-1",
      year: 2026,
      isProvisional: false,
    });
    expect(await server.closing.get("fp-1", 2026)).toEqual({
      isProvisional: false,
    });

    await server.closing.cancel("fp-1", 2026);
    expect(await server.closing.get("fp-1", 2026)).toBeNull();
  });
});

function createMemoryDb(): OpenkkDbPort {
  const closings = new Map<string, ClosingApiRecord>();
  return {
    fiscalPeriods: {
      async getAllByUser() {
        return [fiscalPeriod({ id: "fp-1" })];
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
      async getAllByFiscalPeriod() {
        return [];
      },
      async getById() {
        return null;
      },
      async create(_userId: string, fiscalPeriodId: string, input: FixedAssetCreateInput) {
        return fixedAsset({ id: "asset-1", fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, fiscalPeriodId: "fp-1", ...patch });
      },
      async delete() {},
    },
    closings: {
      async get(fiscalPeriodId, year) {
        return closings.get(`${fiscalPeriodId}:${year}`) ?? null;
      },
      async upsert(fiscalPeriodId, year, isProvisional) {
        closings.set(`${fiscalPeriodId}:${year}`, { isProvisional });
      },
      async delete(fiscalPeriodId, year) {
        closings.delete(`${fiscalPeriodId}:${year}`);
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
    stage: "journalizing",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
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
