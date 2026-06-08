import { describe, expect, it } from "vitest";

import { AppError } from "@rubydogjp/openkk-server-domain";
import { createOpenkkServer } from "./index";
import type {
  ClosingApiRecord,
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodArchiveDbImportInput,
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
      fiscalPeriod({
        id: "fp-user-1",
        userId: "user-1",
        name: "user-1 period",
      }),
      fiscalPeriod({
        id: "fp-user-2",
        userId: "user-2",
        name: "user-2 period",
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-2", { name: "updated by user-1" }),
    ).rejects.toThrow(/Fiscal period fp-user-2 not found/);

    expect((await db.fiscalPeriods.getById("fp-user-2"))?.name).toBe(
      "user-2 period",
    );

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

  it("rejects patches to archived fiscal periods", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({
        id: "fp-archived",
        userId: "user-1",
        archiveStatus: "archived",
      }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    const error = await captureAsyncError(() =>
      server.fiscalPeriod.patch("fp-archived", { name: "updated" }),
    );

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).messageForDeveloper).toContain(
      "Archived fiscal period fp-archived cannot be updated",
    );
    expect((error as AppError).messageForUser).toContain("圧縮保存済み");
    expect((error as AppError).statusCode).toBe(409);

    expect((await db.fiscalPeriods.getById("fp-archived"))?.name).toBe(
      "2026年分",
    );
  });

  it("rejects an opening patch whose opening journal is unbalanced", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingJournals: [
            openingJournal({
              lines: [
                openingLine({ side: "debit", amount: 1000 }),
                openingLine({ side: "credit", amount: 900 }),
              ],
            }),
          ],
        }),
      }),
    ).rejects.toThrow(/Opening journal debit total .* must equal credit total/);
  });

  it("rejects an opening patch with a negative opening balance amount", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingBalanceLines: [
            { id: "l1", accountId: "a:現金", amount: -100 },
          ],
        }),
      }),
    ).rejects.toThrow(/Opening balance amount must be a non-negative/);
  });

  it("rejects an opening patch with duplicate opening balance accountIds", async () => {
    const db = createFiscalPeriodDb([
      fiscalPeriod({ id: "fp-user-1", userId: "user-1" }),
    ]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    await expect(
      server.fiscalPeriod.patch("fp-user-1", {
        opening: openingPatch({
          openingBalanceLines: [
            { id: "l1", accountId: "a:現金", amount: 100 },
            { id: "l2", accountId: "a:現金", amount: 200 },
          ],
        }),
      }),
    ).rejects.toThrow(/duplicate accountId/);
  });

  it("restores an archive as a new active period in its captured phase", async () => {
    const db = createFiscalPeriodDb([]);
    const server = createOpenkkServer(db, { userId: "user-1" });

    const imported = await server.fiscalPeriod.importArchived({
      manifest: { fiscalPeriodId: "fp-source" },
      fiscalPeriod: {
        id: "fp-source",
        name: "Archived",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "post_closing",
        settingsCompleted: true,
        openingBalancesCompleted: true,
        documentsReceivedCompleted: true,
        opening: null,
      },
      entries: [],
      fixedAssets: [],
      closings: [],
    });

    expect(imported).toMatchObject({
      name: "Archived",
      archiveStatus: "active",
      phase: "post_closing",
    });
    expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([imported]);
  });
});

async function captureAsyncError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to reject");
}

function createFiscalPeriodDb(
  seed: StoredFiscalPeriodApiRecord[],
): OpenkkDbPort {
  const fiscalPeriods = new Map(seed.map((period) => [period.id, period]));
  return {
    fiscalPeriods: {
      async getAllByUser(userId) {
        return [...fiscalPeriods.values()].filter(
          (period) => period.userId === userId,
        );
      },
      async getById(id) {
        return fiscalPeriods.get(id) ?? null;
      },
      async create(userId: string, input: FiscalPeriodCreateInput) {
        const record = fiscalPeriod({
          id: `fp-${fiscalPeriods.size + 1}`,
          userId,
          ...input,
        });
        fiscalPeriods.set(record.id, record);
        return record;
      },
      async importArchived(
        userId: string,
        input: FiscalPeriodArchiveDbImportInput,
      ) {
        const { opening, ...rest } = input.fiscalPeriod;
        const record = fiscalPeriod({
          id: `fp-${fiscalPeriods.size + 1}`,
          userId,
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
        fiscalPeriods.set(record.id, record);
        return record;
      },
      async update(id: string, patch: FiscalPeriodPatchInput) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const { opening, ...rest } = patch;
        const updated = fiscalPeriod({
          ...current,
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
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async archive(id: string) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const updated = fiscalPeriod({ ...current, archiveStatus: "archived" });
        fiscalPeriods.set(id, updated);
        return updated;
      },
      async purgeArchivedData(id: string) {
        const current = fiscalPeriods.get(id);
        if (current == null) throw new Error(`fiscal period not found: ${id}`);
        const updated = fiscalPeriod({
          ...current,
          archiveStatus: "archived",
          archiveDataAvailable: false,
        });
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
      async getById() {
        return null;
      },
      async create(
        _userId: string,
        fiscalPeriodId: string,
        input: EntryUpsertInput,
      ) {
        return entry({
          fiscalPeriodId,
          ...input,
          lines: entryLinesWithIds(input.lines),
        });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({ id, ...input, lines: entryLinesWithIds(input.lines) });
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
            lines: entryLinesWithIds(input.lines),
          }),
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
        return fixedAsset({ fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, ...patch });
      },
      async delete() {},
    },
    preClosings: {
      async get() {
        return null;
      },
      async run() {
        throw new Error("not implemented");
      },
      async cancel() {
        throw new Error("not implemented");
      },
    },
    closings: {
      async get(): Promise<ClosingApiRecord | null> {
        return null;
      },
      async run() {
        throw new Error("not implemented");
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
  overrides: Partial<StoredFiscalPeriodApiRecord>,
): StoredFiscalPeriodApiRecord {
  return {
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
    ...overrides,
  };
}

type OpeningPatch = NonNullable<FiscalPeriodPatchInput["opening"]>;

function openingPatch(overrides: Partial<OpeningPatch>): OpeningPatch {
  return {
    id: "op-fp-user-1",
    userId: "user-1",
    fiscalPeriodId: "fp-user-1",
    openingBalanceLines: [],
    openingJournals: [],
    ...overrides,
  };
}

function openingJournal(
  overrides: Partial<OpeningPatch["openingJournals"][number]>,
): OpeningPatch["openingJournals"][number] {
  return {
    id: "oj-1",
    date: "2026-01-01",
    description: "期首再振替",
    businessRate: 1,
    lines: [],
    ...overrides,
  };
}

function openingLine(
  overrides: Partial<OpeningPatch["openingJournals"][number]["lines"][number]>,
): OpeningPatch["openingJournals"][number]["lines"][number] {
  return {
    id: "ojl-1",
    side: "debit",
    bookAccountId: "acct_cash",
    amount: 0,
    partnerName: "",
    taxCategoryId: "",
    businessCategoryId: "",
    ...overrides,
  };
}

function entry(overrides: Partial<EntryApiRecord>): EntryApiRecord {
  return {
    id: "entry-1",
    userId: "user-1",
    fiscalPeriodId: "fp-1",
    date: "2026-01-01",
    description: "entry",
    localId: "",
    businessRate: 1,
    lines: [],
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

function fixedAsset(
  overrides: Partial<FixedAssetApiRecord>,
): FixedAssetApiRecord {
  return {
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
    disposalDate: "",
    disposalPrice: 0,
    bookAccountId: "",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}
