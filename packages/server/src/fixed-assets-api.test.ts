import { describe, expect, it } from "vitest";

import { createOpenkkServer } from "./index.js";
import { MAX_FIXED_ASSET_USEFUL_LIFE_YEARS } from "@rubydogjp/openkk-server-domain";
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
  it("rejects invalid acquisition dates before persisting", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "不正日付の資産",
        acquisitionDate: "2026-02-29",
        acquisitionCost: 180000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/Fixed asset acquisition date is invalid/);

    expect(await server.fixedAssets.getAll("fp-1")).toEqual([]);
  });

  it("rejects invalid fixed asset numbers before persisting", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "不正金額の資産",
        acquisitionDate: "2026-04-01",
        acquisitionCost: -1,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(
      /Fixed asset acquisition cost must be a positive integer/,
    );

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "ゼロ円の資産",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 0,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/Fixed asset acquisition cost must be a positive integer/);

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "小数円の資産",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 180000.5,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/positive integer/);

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "不正耐用年数の資産",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 180000,
        usefulLife: 1.5,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/Fixed asset useful life must be a positive integer/);

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "耐用年数が長すぎる資産",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 180000,
        usefulLife: MAX_FIXED_ASSET_USEFUL_LIFE_YEARS + 1,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/useful life must not exceed 100 years/);

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "不正事業割合の資産",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 180000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: Infinity,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/Fixed asset business rate must be between 0 and 1/);

    expect(await server.fixedAssets.getAll("fp-1")).toEqual([]);
  });

  it("rejects unknown fixed asset enum values at the runtime boundary", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const invalidCreate = {
      name: "不正な償却方法",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "declining_balance",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    } as unknown as FixedAssetCreateInput;

    await expect(
      server.fixedAssets.create("fp-1", invalidCreate),
    ).rejects.toThrow(/depreciation method is invalid/);

    const created = await server.fixedAssets.create("fp-1", {
      ...invalidCreate,
      depreciationMethod: "straight_line",
    });
    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "unknown",
      } as unknown as FixedAssetPatchInput),
    ).rejects.toThrow(/status is invalid/);
    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        disposalDate: 20261201,
      } as unknown as FixedAssetPatchInput),
    ).rejects.toThrow(/disposal date must be a string/);
  });

  it("rejects invalid disposal dates before persisting", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "売却対象の資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "sold",
        disposalDate: "2026-13-01",
      }),
    ).rejects.toThrow(/Fixed asset disposal date is invalid/);

    expect((await server.fixedAssets.getAll("fp-1"))[0]?.status).toBe("active");
  });

  it("rejects a disposal date before the acquisition date", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "売却対象の資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "sold",
        disposalDate: "2026-03-31",
        disposalPrice: 0,
      }),
    ).rejects.toThrow(/must not be before acquisition date/);

    expect((await server.fixedAssets.getAll("fp-1"))[0]?.status).toBe("active");
  });

  it("rejects invalid disposal prices before persisting", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "売却対象の資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "sold",
        disposalDate: "2026-12-01",
        disposalPrice: -1,
      }),
    ).rejects.toThrow(
      /Fixed asset disposal price must be a non-negative finite number/,
    );

    expect((await server.fixedAssets.getAll("fp-1"))[0]?.status).toBe("active");
  });

  it("rejects marking a fixed asset sold/disposed without a disposal date", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "処分日なしの資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.patch("fp-1", created.id, { status: "sold" }),
    ).rejects.toThrow(/requires a disposal date/);
    await expect(
      server.fixedAssets.patch("fp-1", created.id, { status: "disposed" }),
    ).rejects.toThrow(/requires a disposal date/);

    expect((await server.fixedAssets.getAll("fp-1"))[0]?.status).toBe("active");
  });

  it("allows marking a fixed asset retired without a disposal date", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "償却完了の資産",
      acquisitionDate: "2023-01-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    const updated = await server.fixedAssets.patch("fp-1", created.id, {
      status: "retired",
    });
    expect(updated.status).toBe("retired");
  });

  it("rejects retiring an asset before it reaches memorandum value", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "償却途中の資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.patch("fp-1", created.id, { status: "retired" }),
    ).rejects.toThrow(/cannot be retired before it reaches memorandum value/);
    expect((await server.fixedAssets.getAll("fp-1"))[0]?.status).toBe(
      "active",
    );
  });

  it("rejects disposal data for statuses that do not use it", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const created = await server.fixedAssets.create("fp-1", {
      name: "状態整合性を確認する資産",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "retired",
        disposalDate: "2026-12-01",
      }),
    ).rejects.toThrow(/must not have a disposal date/);

    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "disposed",
        disposalDate: "2026-12-01",
        disposalPrice: 1000,
      }),
    ).rejects.toThrow(/must not have a disposal price/);

    expect((await server.fixedAssets.getAll("fp-1"))[0]?.status).toBe(
      "active",
    );
  });

  it("rejects future acquisitions and out-of-period disposals", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "future asset",
        acquisitionDate: "2027-01-01",
        acquisitionCost: 180000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/must not be after fiscal period end/);

    const created = await server.fixedAssets.create("fp-1", {
      name: "asset",
      acquisitionDate: "2025-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });
    await expect(
      server.fixedAssets.patch("fp-1", created.id, {
        status: "sold",
        disposalDate: "2025-12-31",
        disposalPrice: 0,
      }),
    ).rejects.toThrow(/disposal date .* must be within fiscal period/);
  });

  it("rejects unknown and non-fixed-asset book accounts", async () => {
    const db = createFixedAssetDb();
    const server = createOpenkkServer(db, { userId: "user-1" });
    const input = {
      name: "asset",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 180000,
      usefulLife: 4,
      depreciationMethod: "straight_line" as const,
      businessRate: 1,
      bookAccountId: "unknown-account",
    };

    await expect(server.fixedAssets.create("fp-1", input)).rejects.toThrow(
      /must reference a fixed-asset account/,
    );
    await expect(
      server.fixedAssets.create("fp-1", {
        ...input,
        bookAccountId: "acct_cash",
      }),
    ).rejects.toThrow(/must reference a fixed-asset account/);
  });

  it("rejects fixed asset changes in archived fiscal periods", async () => {
    const db = createFixedAssetDb({ archiveStatus: "archived" });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "archived asset",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 180000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/Archived fiscal period fp-1 cannot create fixed asset/);

    expect(await server.fixedAssets.getAll("fp-1")).toEqual([]);
  });

  it("rejects fixed asset mutations after final closing", async () => {
    const db = createFixedAssetDb({ phase: "post_closing" });
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fixedAssets.create("fp-1", {
        name: "closed asset",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 180000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      }),
    ).rejects.toThrow(/cannot create fixed asset from phase post_closing/);

    expect(await server.fixedAssets.getAll("fp-1")).toEqual([]);
  });

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
      bookAccountId: "acct_equipment",
    });

    await expect(
      server.fixedAssets.remove("fp-other", created.id),
    ).rejects.toThrow(/Fiscal period fp-other not found/);
    expect(await server.fixedAssets.getAll("fp-1")).toHaveLength(1);

    await server.fixedAssets.remove("fp-1", created.id);
    expect(await server.fixedAssets.getAll("fp-1")).toEqual([]);
  });
});

function createFixedAssetDb(
  fiscalPeriodOverrides: Partial<FiscalPeriodApiRecord> = {},
): OpenkkDbPort {
  const fixedAssets = new Map<string, FixedAssetApiRecord>();
  return {
    fiscalPeriods: {
      async getAllByUser() {
        return [fiscalPeriod({ id: "fp-1", ...fiscalPeriodOverrides })];
      },
      async getById(id) {
        return id === "fp-1"
          ? fiscalPeriod({ id, ...fiscalPeriodOverrides })
          : null;
      },
      async create(_userId: string, input: FiscalPeriodCreateInput) {
        return fiscalPeriod({ ...input, id: "fp-1" });
      },
      async createNext() {
        throw new Error("unexpected createNext call");
      },
      async importArchived() {
        return fiscalPeriod({ id: "fp-archive", archiveStatus: "archived" });
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        const { opening, ...rest } = patch;
        return fiscalPeriod({
          id,
          ...rest,
          ...(opening != null
            ? {
                opening: {
                  ...opening,
                  createdAt: TEST_TIMESTAMP,
                  updatedAt: TEST_TIMESTAMP,
                },
              }
            : {}),
        });
      },
      async archive(id: string) {
        return fiscalPeriod({ id, archiveStatus: "archived" });
      },
      async purgeArchivedData(id: string) {
        return fiscalPeriod({
          id,
          archiveStatus: "archived",
          archiveDataAvailable: false,
        });
      },
      async delete() {},
    },
    entries: {
      async getAll() {
        return [];
      },
      async getById() {
        return null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: EntryUpsertInput,
      ) {
        return entry({
          id: "entry-1",
          fiscalPeriodId,
          ...input,
          localId: input.localId,
          lines: entryLinesWithIds(input.lines),
        });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({
          id,
          fiscalPeriodId: "fp-1",
          ...input,
          localId: input.localId,
          lines: entryLinesWithIds(input.lines),
        });
      },
      async delete() {},
      async importMany(
        _userId: string,
        fiscalPeriodId: string,
        inputs: EntryUpsertInput[],
      ) {
        return inputs.map((input, index) =>
          entry({
            id: `entry-${index + 1}`,
            fiscalPeriodId,
            ...input,
            localId: input.localId,
            lines: entryLinesWithIds(input.lines),
          }),
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
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: FixedAssetCreateInput,
      ) {
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

const TEST_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function entryLinesWithIds(
  lines: EntryUpsertInput["lines"],
): EntryApiRecord["lines"] {
  return lines.map((line, index) => ({ ...line, id: `line-${index + 1}` }));
}

function fiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  const base: FiscalPeriodApiRecord = {
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    settingsCompleted: true,
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    opening: null,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    archiveDataAvailable: true,
    archivedAt: null,
  };
  return Object.assign(base, overrides);
}

function entry(overrides: Partial<EntryApiRecord>): EntryApiRecord {
  const base: EntryApiRecord = {
    id: "entry-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "entry",
    localId: null,
    businessRate: 1,
    lines: [],
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  return Object.assign(base, overrides);
}

function fixedAsset(
  overrides: Partial<FixedAssetApiRecord>,
): FixedAssetApiRecord {
  const base: FixedAssetApiRecord = {
    id: "asset-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    name: "asset",
    acquisitionDate: "2026-01-01",
    acquisitionCost: 0,
    usefulLife: 0,
    depreciationMethod: "straight_line",
    businessRate: 1,
    status: "active",
    disposalDate: null,
    disposalPrice: null,
    bookAccountId: "",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
  return Object.assign(base, overrides);
}
