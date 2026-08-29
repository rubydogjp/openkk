import { describe, expect, it } from "vitest";

import { createOpenkkServer } from "./index.js";
import type {
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
  it("keeps pre-closing and final closing records separate", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });

    expect(await server.preClosing.get("fp-1", 2026)).toBeNull();
    expect(await server.closing.get("fp-1", 2026)).toBeNull();

    const preClosed = await server.preClosing.run({
      fiscalPeriodId: "fp-1",
      year: 2026,
    });
    expect(preClosed.phase).toBe("pre_closing");
    expect(await server.preClosing.get("fp-1", 2026)).toEqual({});
    expect(await server.closing.get("fp-1", 2026)).toBeNull();

    const closed = await server.closing.run({
      fiscalPeriodId: "fp-1",
      year: 2026,
      entries: [],
    });
    expect(closed.phase).toBe("post_closing");
    expect(await server.preClosing.get("fp-1", 2026)).toEqual({});
    expect(await server.closing.get("fp-1", 2026)).toEqual({});
  });

  it("cancels only pre-closing and returns to journalizing", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });
    await server.preClosing.run({ fiscalPeriodId: "fp-1", year: 2026 });
    const reopened = await server.preClosing.cancel("fp-1", 2026);
    expect(reopened.phase).toBe("journalizing");
    expect(await server.preClosing.get("fp-1", 2026)).toBeNull();
  });

  it("requires the closing year to match the fiscal period end year", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });

    await expect(
      server.preClosing.run({ fiscalPeriodId: "fp-1", year: 2025 }),
    ).rejects.toThrow(/must match fiscal period end year 2026/);
    await server.preClosing.run({ fiscalPeriodId: "fp-1", year: 2026 });
    await expect(
      server.closing.run({ fiscalPeriodId: "fp-1", year: 2025, entries: [] }),
    ).rejects.toThrow(/must match fiscal period end year 2026/);
  });

  it("accepts only unique, in-period generated entries for final closing", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });
    await server.preClosing.run({ fiscalPeriodId: "fp-1", year: 2026 });
    const generated = validClosingEntry("virtual:closing-entry");

    await expect(
      server.closing.run({
        fiscalPeriodId: "fp-1",
        year: 2026,
        entries: [{ ...generated, localId: "ordinary-entry" }],
      }),
    ).rejects.toThrow(/must use a reserved generated localId/);
    await expect(
      server.closing.run({
        fiscalPeriodId: "fp-1",
        year: 2026,
        entries: [generated, generated],
      }),
    ).rejects.toThrow(/duplicate localId/);
    await expect(
      server.closing.run({
        fiscalPeriodId: "fp-1",
        year: 2026,
        entries: [{ ...generated, date: "2027-01-01" }],
      }),
    ).rejects.toThrow(/must be within fiscal period/);
  });

  it("rejects closing changes in archived fiscal periods", async () => {
    const server = createOpenkkServer(
      createMemoryDb({ archiveStatus: "archived" }),
      {
        userId: "user-1",
      },
    );

    await expect(
      server.preClosing.run({
        fiscalPeriodId: "fp-1",
        year: 2026,
      }),
    ).rejects.toThrow(/Archived fiscal period fp-1 cannot run pre-closing/);

    await expect(server.preClosing.cancel("fp-1", 2026)).rejects.toThrow(
      /Archived fiscal period fp-1 cannot cancel pre-closing/,
    );
  });
});

function createMemoryDb(
  fiscalPeriodOverrides: Partial<FiscalPeriodApiRecord> = {},
): OpenkkDbPort {
  const preClosings = new Set<string>();
  const closings = new Set<string>();
  let current = fiscalPeriod({ id: "fp-1", ...fiscalPeriodOverrides });
  return {
    fiscalPeriods: {
      async getAllByUser() {
        return [current];
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
        const { opening, ...rest } = patch;
        current = fiscalPeriod({
          ...current,
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
        return current;
      },
      async archive() {
        current = { ...current, archiveStatus: "archived" };
        return current;
      },
      async purgeArchivedData() {
        current = {
          ...current,
          archiveStatus: "archived",
          archiveDataAvailable: false,
        };
        return current;
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
          lines: entryLinesWithIds(input.lines),
        });
      },
      async update(id: string, input: EntryUpsertInput) {
        return entry({
          id,
          fiscalPeriodId: "fp-1",
          ...input,
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
        return fixedAsset({ id: "asset-1", fiscalPeriodId, ...input });
      },
      async update(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, fiscalPeriodId: "fp-1", ...patch });
      },
      async delete() {},
    },
    preClosings: {
      async get(fiscalPeriodId, year) {
        return preClosings.has(`${fiscalPeriodId}:${year}`) ? {} : null;
      },
      async run(fiscalPeriodId, year) {
        preClosings.add(`${fiscalPeriodId}:${year}`);
        current = { ...current, phase: "pre_closing" };
        return current;
      },
      async cancel(fiscalPeriodId, year) {
        preClosings.delete(`${fiscalPeriodId}:${year}`);
        current = { ...current, phase: "journalizing" };
        return current;
      },
    },
    closings: {
      async get(fiscalPeriodId, year) {
        return closings.has(`${fiscalPeriodId}:${year}`) ? {} : null;
      },
      async run(fiscalPeriodId, year) {
        closings.add(`${fiscalPeriodId}:${year}`);
        current = { ...current, phase: "post_closing" };
        return current;
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

function fiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
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
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
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

function entryLinesWithIds(
  lines: EntryUpsertInput["lines"],
): EntryApiRecord["lines"] {
  return lines.map((line, index) => ({ ...line, id: `line-${index + 1}` }));
}

function validClosingEntry(localId: string): EntryUpsertInput {
  return {
    date: "2026-12-31",
    description: "closing generated entry",
    localId,
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
