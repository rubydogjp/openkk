import { describe, expect, it } from "vitest";

import { createOpenkkServer } from "./index.js";
import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
} from "@rubydogjp/openkk-server-domain";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
  OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";

describe("openkk server closing flow", () => {
  it("moves through pre-closing to final closing", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });

    const preClosed = await server.preClosings.run("fp-1");
    expect(preClosed.phase).toBe("pre_closing");

    const closed = await server.closings.run("fp-1", []);
    expect(closed.phase).toBe("post_closing");
  });

  it("cancels only pre-closing and returns to journalizing", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });
    await server.preClosings.run("fp-1");
    const reopened = await server.preClosings.cancel("fp-1");
    expect(reopened.phase).toBe("journalizing");
  });

  it("rejects blank fiscal period ids for closing operations", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });

    await expect(server.preClosings.run("")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(server.closings.run("", [])).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("requires opening balances before pre-closing", async () => {
    const openingIncomplete = createOpenkkServer(
      createMemoryDb({ openingBalancesCompleted: false }),
      { userId: "user-1" },
    );
    await expect(
      openingIncomplete.preClosings.run("fp-1"),
    ).rejects.toThrow(/before opening balances are completed/);
  });

  it("does not let a concurrent entry creation slip past pre-closing", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });
    const [preClosing, entryCreate] = await Promise.allSettled([
      server.preClosings.run("fp-1"),
      server.entries.create("fp-1", {
        date: "2026-08-31",
        description: "仮締めと競合する仕訳",
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
        localId: null,
      }),
    ]);

    expect(preClosing.status).toBe("fulfilled");
    expect(entryCreate.status).toBe("rejected");
    if (entryCreate.status === "rejected") {
      expect(String(entryCreate.reason)).toContain(
        "cannot create entry from phase pre_closing",
      );
    }
  });

  it("recomputes fixed-asset closing entries and rejects missing materialization", async () => {
    const asset = fixedAsset({
      id: "asset-1",
      acquisitionDate: "2026-01-01",
      acquisitionCost: 120_000,
      usefulLife: 4,
      businessRate: 1,
      status: "active",
      bookAccountId: "acct_equipment",
    });
    const server = createOpenkkServer(
      createMemoryDb({}, { fixedAssets: [asset] }),
      { userId: "user-1" },
    );
    await server.preClosings.run("fp-1");

    await expect(
      server.closings.run("fp-1", []),
    ).rejects.toThrow(/do not match the current fiscal-period source data/);

    const closed = await server.closings.run("fp-1", [
      {
        date: "2026-12-31",
        description: "assetの減価償却",
        localId: "virtual:virtual-fixed-asset-asset-1",
        businessRate: 1,
        lines: [
          {
            side: "debit",
            bookAccountId: "acct_depreciation",
            amount: 29_999,
            partnerName: "",
            taxCategoryId: "tax_out_of_scope",
            businessCategoryId: "biz_none",
          },
          {
            side: "credit",
            bookAccountId: "acct_equipment",
            amount: 29_999,
            partnerName: "",
            taxCategoryId: "tax_out_of_scope",
            businessCategoryId: "biz_none",
          },
        ],
      },
    ]);
    expect(closed.phase).toBe("post_closing");
  });

  it("accepts only unique, in-period generated entries for final closing", async () => {
    const server = createOpenkkServer(createMemoryDb(), { userId: "user-1" });
    await server.preClosings.run("fp-1");
    const generated = validClosingEntry("virtual:closing-entry");

    await expect(
      server.closings.run("fp-1", [
        { ...generated, localId: "ordinary-entry" },
      ]),
    ).rejects.toThrow(/must use a reserved generated localId/);
    await expect(
      server.closings.run("fp-1", [generated, generated]),
    ).rejects.toThrow(/Closing entry localId has a duplicate value/);
    await expect(
      server.closings.run("fp-1", [{ ...generated, date: "2027-01-01" }]),
    ).rejects.toThrow(/must be within fiscal period/);
  });

  it("rejects oversized generated closing input before comparison", async () => {
    const tooManyServer = createOpenkkServer(createMemoryDb(), {
      userId: "user-1",
    });
    await tooManyServer.preClosings.run("fp-1");
    const generated = validClosingEntry("virtual:closing-entry");
    await expect(
      tooManyServer.closings.run(
        "fp-1",
        Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(generated),
      ),
    ).rejects.toThrow(/Closing entries exceed the 10,000 item limit/);

    const tooManyLinesServer = createOpenkkServer(createMemoryDb(), {
      userId: "user-1",
    });
    await tooManyLinesServer.preClosings.run("fp-1");
    const debit = generated.lines[0]!;
    const credit = generated.lines[1]!;
    const lines = [
      ...Array(MAX_ENTRY_LINES / 2).fill(debit),
      ...Array(MAX_ENTRY_LINES / 2).fill(credit),
    ];
    const entries = Array.from(
      { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
      (_, index) => ({
        ...generated,
        localId: `virtual:closing-entry-${index}`,
        lines,
      }),
    );
    await expect(
      tooManyLinesServer.closings.run("fp-1", entries),
    ).rejects.toThrow(/Closing entries exceed the 100,000 line limit/);
  });

  it("rejects closing changes in archived fiscal periods", async () => {
    const server = createOpenkkServer(
      createMemoryDb({ archiveStatus: "archived" }),
      {
        userId: "user-1",
      },
    );

    await expect(
      server.preClosings.run("fp-1"),
    ).rejects.toThrow(/Archived fiscal period fp-1 cannot run pre-closing/);

    await expect(server.preClosings.cancel("fp-1")).rejects.toThrow(
      /Archived fiscal period fp-1 cannot cancel pre-closing/,
    );
  });
});

function createMemoryDb(
  fiscalPeriodOverrides: Partial<FiscalPeriodApiRecord> = {},
  sources: Partial<{
    entries: EntryApiRecord[];
    fixedAssets: FixedAssetApiRecord[];
  }> = {},
): OpenkkDbPort {
  let current = fiscalPeriod({ id: "fp-1", ...fiscalPeriodOverrides });
  return {
    fiscalPeriods: {
      async getAll() {
        return [current];
      },
      async getById(id) {
        return id === current.id ? current : null;
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
      async patch(id: string, patch: FiscalPeriodPatchInput) {
        const { opening, ...rest } = patch;
        current = fiscalPeriod({
          ...current,
          id,
          ...rest,
          ...(opening != null
            ? {
                opening: {
                  ...current.opening,
                  ...opening,
                },
              }
            : {}),
        });
        return current;
      },
      async start() {
        current = { ...current, phase: "journalizing" };
        return current;
      },
      async archive() {
        current = { ...current, archiveStatus: "archived" };
        return current;
      },
      async purgeArchivedData() {
        current = {
          ...current,
          archiveStatus: "purged",
        };
        return current;
      },
      async remove() {},
    },
    entries: {
      async getAll() {
        return sources.entries ?? [];
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
      async remove() {},
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
      async getAll() {
        return sources.fixedAssets ?? [];
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
      async patch(id: string, patch: FixedAssetPatchInput) {
        return fixedAsset({ id, fiscalPeriodId: "fp-1", ...changedFields(patch) });
      },
      async remove() {},
    },
    preClosings: {
      async run() {
        current = { ...current, phase: "pre_closing" };
        return current;
      },
      async cancel() {
        current = { ...current, phase: "journalizing" };
        return current;
      },
    },
    closings: {
      async run() {
        current = { ...current, phase: "post_closing" };
        return current;
      },
    },
    masterData: {
      async getBookAccounts(): Promise<MasterBookAccountDbRecord[]> {
        return [];
      },
      async getTaxCategories(): Promise<MasterTaxCategoryDbRecord[]> {
        return [];
      },
      async getBusinessCategories(): Promise<
        MasterBusinessCategoryDbRecord[]
      > {
        return [];
      },
    },
  };
}

const TEST_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function fiscalPeriod(
  overrides: Partial<FiscalPeriodApiRecord>,
): FiscalPeriodApiRecord {
  const period: FiscalPeriodApiRecord = Object.assign({
    id: "fp-1",
    userId: "user-1",
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "journalizing",
    archiveStatus: "active",
    openingBalancesCompleted: true,
    documentsReceivedCompleted: false,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  } as FiscalPeriodApiRecord, overrides);
  return {
    ...period,
    opening:
      overrides.opening === undefined
        ? {
            balanceLines: [],
            journals: [],
          }
        : overrides.opening,
  };
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

function changedFields<T extends object>(patch: T): {
  [K in keyof T]?: Exclude<T[K], null>;
} {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null),
  ) as { [K in keyof T]?: Exclude<T[K], null> };
}
