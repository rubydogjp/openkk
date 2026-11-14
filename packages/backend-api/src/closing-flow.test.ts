import { describe, expect, it } from "vitest";

import { createOpenkkBackendApi } from "./index.js";
import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
} from "@rubydogjp/openkk-engine";
import type {
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
  OpenkkDbPort,
} from "@rubydogjp/openkk-engine";
import type {
  EntryApiRecord,
  EntryUpsertInput,
  FiscalPeriodApiRecord,
  FiscalPeriodCreateInput,
  FiscalPeriodPatchInput,
  FixedAssetApiRecord,
  FixedAssetCreateInput,
  FixedAssetPatchInput,
} from "./contract.js";
import {
  changedFields,
  entry,
  entryLinesWithIds,
  fiscalPeriod,
  fixedAsset,
} from "../test-support/api-records.js";

describe("backend-api closing flow", () => {
  it("moves through pre-closing to final closing", async () => {
    const backendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });

    const preClosed = await backendApi.preClosings.run("fp-1");
    expect(preClosed.phase).toBe("pre_closing");

    const closed = await backendApi.closings.run("fp-1", []);
    expect(closed.phase).toBe("post_closing");
  });

  it("cancels only pre-closing and returns to journalizing", async () => {
    const backendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });
    await backendApi.preClosings.run("fp-1");
    const reopened = await backendApi.preClosings.cancel("fp-1");
    expect(reopened.phase).toBe("journalizing");
  });

  it("rejects blank fiscal period ids for closing operations", async () => {
    const backendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });

    await expect(backendApi.preClosings.run("")).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(backendApi.closings.run("", [])).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("requires opening balances before pre-closing", async () => {
    const openingIncomplete = createOpenkkBackendApi(
      createMemoryDb({ openingBalancesCompleted: false }),
      { userId: "user-1" },
    );
    await expect(openingIncomplete.preClosings.run("fp-1")).rejects.toThrow(
      /before opening balances are completed/,
    );
  });

  it("does not let a concurrent entry creation slip past pre-closing", async () => {
    const backendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });
    const [preClosing, entryCreate] = await Promise.allSettled([
      backendApi.preClosings.run("fp-1"),
      backendApi.entries.create("fp-1", {
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
    const backendApi = createOpenkkBackendApi(
      createMemoryDb({}, { fixedAssets: [asset] }),
      { userId: "user-1" },
    );
    await backendApi.preClosings.run("fp-1");

    await expect(backendApi.closings.run("fp-1", [])).rejects.toThrow(
      /do not match the current fiscal-period source data/,
    );

    const closed = await backendApi.closings.run("fp-1", [
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
    const backendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });
    await backendApi.preClosings.run("fp-1");
    const generated = validClosingEntry("virtual:closing-entry");

    await expect(
      backendApi.closings.run("fp-1", [
        { ...generated, localId: "ordinary-entry" },
      ]),
    ).rejects.toThrow(/must use a reserved generated localId/);
    await expect(
      backendApi.closings.run("fp-1", [generated, generated]),
    ).rejects.toThrow(/Closing entry localId has a duplicate value/);
    await expect(
      backendApi.closings.run("fp-1", [{ ...generated, date: "2027-01-01" }]),
    ).rejects.toThrow(/must be within fiscal period/);
  });

  it("rejects oversized generated closing input before comparison", async () => {
    const tooManyBackendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });
    await tooManyBackendApi.preClosings.run("fp-1");
    const generated = validClosingEntry("virtual:closing-entry");
    await expect(
      tooManyBackendApi.closings.run(
        "fp-1",
        Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(generated),
      ),
    ).rejects.toThrow(/Closing entries exceed the 10,000 item limit/);

    const tooManyLinesBackendApi = createOpenkkBackendApi(createMemoryDb(), {
      userId: "user-1",
    });
    await tooManyLinesBackendApi.preClosings.run("fp-1");
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
      tooManyLinesBackendApi.closings.run("fp-1", entries),
    ).rejects.toThrow(/Closing entries exceed the 100,000 line limit/);
  });

  it("rejects closing changes in a fiscal period whose data was purged", async () => {
    const backendApi = createOpenkkBackendApi(
      createMemoryDb({ archiveStatus: "purged" }),
      {
        userId: "user-1",
      },
    );

    await expect(backendApi.preClosings.run("fp-1")).rejects.toThrow(
      /Fiscal period fp-1 cannot run pre-closing after its data was purged/,
    );

    await expect(backendApi.preClosings.cancel("fp-1")).rejects.toThrow(
      /Fiscal period fp-1 cannot cancel pre-closing after its data was purged/,
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
      async applyCarryover() {
        throw new Error("unexpected applyCarryover call");
      },
      async applyCarryoverFromArchive() {
        throw new Error("unexpected applyCarryoverFromArchive call");
      },
      async importArchived() {
        return fiscalPeriod({ id: "fp-archive" });
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
        return fixedAsset({
          id,
          fiscalPeriodId: "fp-1",
          ...changedFields(patch),
        });
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
      async getBusinessCategories(): Promise<MasterBusinessCategoryDbRecord[]> {
        return [];
      },
    },
  };
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
