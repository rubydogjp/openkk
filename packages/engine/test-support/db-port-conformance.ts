import { describe, expect, it } from "vitest";
import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES,
} from "../src/domain/index.js";

import type { OpenkkDbPort } from "../src/ports/db-port.js";
import type {
  DbSnapshot,
  FiscalPeriodArchiveDbImportInput,
} from "../src/ports/persistence-types.js";

export type DbPortConformanceContext = {
  makeAdapter: () => Promise<OpenkkDbPort>;
  makeSeededAdapter: (seed: DbSnapshot) => Promise<OpenkkDbPort>;
};

const testEntryLine = {
  side: "debit" as const,
  bookAccountId: "acct_cash",
  amount: 1000,
  partnerName: "",
  taxCategoryId: "tax_out_of_scope",
  businessCategoryId: "",
};

const testCreditEntryLine = {
  ...testEntryLine,
  side: "credit" as const,
  bookAccountId: "acct_sales",
};

function testEntryInput(localId: string | null, description: string) {
  return {
    date: "2026-12-31",
    description,
    localId,
    businessRate: 1,
    lines: [testEntryLine, testCreditEntryLine],
  };
}

export function runDbPortConformance(
  label: string,
  ctx: DbPortConformanceContext,
): void {
  const makeDb = ctx.makeAdapter;

  async function createTestFiscalPeriod(db: OpenkkDbPort) {
    const created = await db.fiscalPeriods.create("user-1", {
      name: "Test period",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await db.fiscalPeriods.start(created.id);
    return db.fiscalPeriods.patch(created.id, {
      openingBalancesCompleted: true,
    });
  }

  function emptyOpening() {
    return { balanceLines: [], journals: [] };
  }

  function seedWithPeriods(...ids: string[]): DbSnapshot {
    return {
      fiscalPeriods: ids.map((id) => ({
        id,
        userId: "user-1",
        name: id,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "journalizing",
        archiveStatus: "active",
        archivedAt: null,
        openingBalancesCompleted: true,
        documentsReceivedCompleted: false,
        opening: emptyOpening(),
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      })),
      entries: [],
      fixedAssets: [],
    };
  }

  describe(`OpenkkDbPort conformance [${label}] / fiscalPeriods`, () => {
    it("create then getById returns the created record", async () => {
      const db = await makeDb();
      const created = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      expect(created.name).toBe("FY2026");
      expect(created.phase).toBe("pre_opening");
      expect(created.opening).toEqual({
        balanceLines: [],
        journals: [],
      });
      expect(await db.fiscalPeriods.getById(created.id)).toEqual(created);
    });

    it("getAll filters by userId", async () => {
      const db = await makeDb();
      const userAPeriod = await db.fiscalPeriods.create("user-A", {
        name: "A1",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await db.fiscalPeriods.create("user-B", {
        name: "B1",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      expect(
        (await db.fiscalPeriods.getAll("user-A")).map((period) => period.id),
      ).toEqual([userAPeriod.id]);
      expect(
        (await db.fiscalPeriods.getAll("user-B")).map((period) => period.name),
      ).toEqual(["B1"]);
    });

    it("creates fiscal periods concurrently", async () => {
      const db = await makeDb();
      const [first, second] = await Promise.all([
        db.fiscalPeriods.create("user-1", {
          name: "Concurrent 1",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
        db.fiscalPeriods.create("user-1", {
          name: "Concurrent 2",
          startDate: "2027-01-01",
          endDate: "2027-12-31",
        }),
      ]);

      expect(first.id).not.toBe(second.id);
      expect(await db.fiscalPeriods.getAll("user-1")).toHaveLength(2);
    });

    it("rejects overlapping active periods inside the persistence transaction", async () => {
      const db = await makeDb();
      const first = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      await expect(
        db.fiscalPeriods.create("user-1", {
          name: "Overlap",
          startDate: "2026-12-31",
          endDate: "2027-12-30",
        }),
      ).rejects.toThrow(/overlaps active fiscal period/);

      const next = await db.fiscalPeriods.create("user-1", {
        name: "FY2027",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      });
      await expect(
        db.fiscalPeriods.patch(next.id, { startDate: first.endDate }),
      ).rejects.toThrow(/overlaps active fiscal period/);
      expect((await db.fiscalPeriods.getById(next.id))?.startDate).toBe(
        "2027-01-01",
      );
    });

    it("rejects malformed fiscal periods at the persistence boundary", async () => {
      const db = await makeDb();

      await expect(
        db.fiscalPeriods.create("user-1", {
          name: "   ",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      ).rejects.toThrow(/name must not be blank/);
      await expect(
        db.fiscalPeriods.create("user-1", {
          name: "inverted",
          startDate: "2026-12-31",
          endDate: "2026-01-01",
        }),
      ).rejects.toThrow(/start date must be on or before end date/);

      expect(await db.fiscalPeriods.getAll("user-1")).toEqual([]);
    });

    it("patch changes only provided fields", async () => {
      const db = await makeDb();
      const created = await db.fiscalPeriods.create("user-1", {
        name: "Original",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      const updated = await db.fiscalPeriods.patch(created.id, {
        name: "Renamed",
      });
      expect(updated.name).toBe("Renamed");
      expect(updated.phase).toBe("pre_opening");
      expect(updated.startDate).toBe("2026-01-01");
      expect(updated.endDate).toBe("2026-12-31");
    });

    it("start moves a pre-opening period to journalizing only once", async () => {
      const db = await makeDb();
      const created = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      const started = await db.fiscalPeriods.start(created.id);
      expect(started.phase).toBe("journalizing");
      expect((await db.fiscalPeriods.getById(created.id))?.phase).toBe(
        "journalizing",
      );
      await expect(db.fiscalPeriods.start(created.id)).rejects.toThrow();
    });

    it("round-trips normalized opening data", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const opening = {
        ...period.opening,
        balanceLines: [
          { id: "balance-1", accountId: "a:現金", amount: 1000 },
          { id: "balance-2", accountId: "l:元入金", amount: 1000 },
        ],
        journals: [
          {
            id: "journal-1",
            date: "2026-01-01",
            description: "carryover",
            businessRate: 1,
            lines: [
              {
                id: "line-1",
                side: "debit" as const,
                bookAccountId: "acct_cash",
                amount: 1000,
                partnerName: "Partner",
                taxCategoryId: "tax_out_of_scope",
                businessCategoryId: "Business",
              },
              {
                id: "line-2",
                side: "credit" as const,
                bookAccountId: "acct_sales",
                amount: 1000,
                partnerName: "Partner",
                taxCategoryId: "tax_out_of_scope",
                businessCategoryId: "Business",
              },
            ],
          },
        ],
      };

      const updated = await db.fiscalPeriods.patch(period.id, { opening });

      expect(updated.opening).toEqual(opening);
      expect((await db.fiscalPeriods.getById(period.id))?.opening).toEqual(
        updated.opening,
      );
      expect((await db.fiscalPeriods.getAll("user-1"))[0]?.opening).toEqual(
        updated.opening,
      );
    });

    it("allows opening-journal drafts but enforces finalization at the persistence boundary", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "Draft opening period",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      const draftOpening = {
        ...period.opening,
        balanceLines: [],
        journals: [
          {
            id: "draft-journal",
            date: "2026-01-01",
            description: "",
            businessRate: 1,
            lines: [
              { id: "draft-debit", ...testEntryLine, amount: 0 },
              { id: "draft-credit", ...testCreditEntryLine, amount: 0 },
            ],
          },
        ],
      };

      const withDraft = await db.fiscalPeriods.patch(period.id, {
        opening: draftOpening,
      });
      expect(withDraft.opening.journals[0]?.description).toBe("");

      await expect(
        db.fiscalPeriods.patch(period.id, {
          openingBalancesCompleted: true,
        }),
      ).rejects.toThrow(/description is required/);
      await expect(
        db.fiscalPeriods.patch(period.id, {
          openingBalancesCompleted: true,
          opening: {
            ...draftOpening,
            journals: draftOpening.journals.map((journal) => ({
              ...journal,
              description: "carryover",
            })),
          },
        }),
      ).rejects.toThrow(/positive debit and credit lines/);
      expect(await db.fiscalPeriods.getById(period.id)).toEqual(withDraft);
    });

    it("rolls back the fiscal period when normalized opening replacement fails", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const invalidOpening = {
        ...period.opening,
        balanceLines: [
          { id: "balance-1", accountId: "a:現金", amount: 1000 },
          { id: "balance-2", accountId: "a:現金", amount: 2000 },
        ],
        journals: [],
      };

      await expect(
        db.fiscalPeriods.patch(period.id, {
          openingBalancesCompleted: true,
          opening: invalidOpening,
        }),
      ).rejects.toThrow(/duplicate|must be unique/);

      expect(await db.fiscalPeriods.getById(period.id)).toEqual(period);
    });

    it("rejects opening range and completed-balance inconsistencies atomically", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      const balancedJournal = {
        id: "journal-1",
        date: "2026-01-01",
        description: "carryover",
        businessRate: 1,
        lines: [
          {
            id: "line-1",
            ...testEntryLine,
          },
          {
            id: "line-2",
            ...testCreditEntryLine,
          },
        ],
      };
      const opening = {
        ...period.opening,
        balanceLines: [],
        journals: [balancedJournal],
      };
      const withOpening = await db.fiscalPeriods.patch(period.id, { opening });

      await expect(
        db.fiscalPeriods.patch(period.id, { startDate: "2026-02-01" }),
      ).rejects.toThrow(/Opening journal date .* must be within fiscal period/);
      await expect(
        db.fiscalPeriods.patch(period.id, {
          openingBalancesCompleted: true,
          opening: {
            ...opening,
            balanceLines: [
              { id: "asset", accountId: "a:現金", amount: 1000 },
              { id: "equity", accountId: "l:元入金", amount: 900 },
            ],
          },
        }),
      ).rejects.toThrow(/Opening balances must balance/);

      expect(await db.fiscalPeriods.getById(period.id)).toEqual(withOpening);
    });

    it("patch throws when record not found", async () => {
      const db = await makeDb();
      await expect(
        db.fiscalPeriods.patch("nonexistent", { name: "x" }),
      ).rejects.toThrow(/fiscal period not found/);
    });

    function carryoverSeed(targetPhase: "journalizing" | "pre_closing") {
      const timestamp = "1970-01-01T00:00:00.000Z";
      const line = (
        id: string,
        side: "debit" | "credit",
        bookAccountId: string,
        amount: number,
      ) => ({
        id,
        side,
        bookAccountId,
        amount,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "",
      });
      const fixedAsset = (
        id: string,
        fiscalPeriodId: string,
        name: string,
        acquisitionDate: string,
      ) => ({
        id,
        userId: "user-1",
        fiscalPeriodId,
        name,
        acquisitionDate,
        acquisitionCost: 100000,
        usefulLife: 4,
        depreciationMethod: "straight_line" as const,
        businessRate: 1,
        status: "active" as const,
        disposalDate: null,
        disposalPrice: null,
        bookAccountId: "acct_equipment",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const [base] = seedWithPeriods("fp-source").fiscalPeriods;
      const seed: DbSnapshot = {
        fiscalPeriods: [
          {
            ...base!,
            phase: "post_closing",
            documentsReceivedCompleted: true,
            opening: {
              balanceLines: [
                { id: "a:現金", accountId: "a:現金", amount: 5000 },
                { id: "l:元入金", accountId: "l:元入金", amount: 5000 },
              ],
              journals: [],
            },
          },
          {
            ...base!,
            id: "fp-target",
            name: "fp-target",
            startDate: "2027-01-01",
            endDate: "2027-12-31",
            phase: targetPhase,
            opening: {
              balanceLines: [
                { id: "a:現金", accountId: "a:現金", amount: 1 },
                { id: "l:元入金", accountId: "l:元入金", amount: 1 },
              ],
              journals: [],
            },
          },
        ],
        entries: [
          {
            id: "e-sales",
            userId: "user-1",
            fiscalPeriodId: "fp-source",
            date: "2026-06-01",
            description: "sales",
            localId: null,
            businessRate: 1,
            lines: [
              line("e-sales-d", "debit", "acct_cash", 1000),
              line("e-sales-c", "credit", "acct_sales", 1000),
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "e-accrued",
            userId: "user-1",
            fiscalPeriodId: "fp-source",
            date: "2026-12-31",
            description: "accrued",
            localId: null,
            businessRate: 1,
            lines: [
              line("e-accrued-d", "debit", "acct_supplies", 300),
              line("e-accrued-c", "credit", "acct_accrued_expense", 300),
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        fixedAssets: [
          fixedAsset("fa-source", "fp-source", "Camera", "2026-04-01"),
          fixedAsset("fa-target", "fp-target", "Typed by hand", "2027-02-01"),
        ],
      };
      return seed;
    }

    it("applyCarryover overwrites the selected items of an existing period", async () => {
      const db = await ctx.makeSeededAdapter(carryoverSeed("journalizing"));

      const updated = await db.fiscalPeriods.applyCarryover("fp-target", {
        sourceFiscalPeriodId: "fp-source",
        carryBalances: true,
        reversalEntryIds: ["e-accrued"],
        carryFixedAssets: true,
      });

      expect(updated.openingBalancesCompleted).toBe(true);
      expect(updated.opening.balanceLines).toEqual(
        expect.arrayContaining([
          { id: "a:現金", accountId: "a:現金", amount: 6000 },
          { id: "l:元入金", accountId: "l:元入金", amount: 5700 },
        ]),
      );
      expect(updated.opening.journals).toHaveLength(1);
      expect(updated.opening.journals[0]!.date).toBe("2027-01-01");
      expect(await db.fiscalPeriods.getById("fp-target")).toEqual(updated);
      const assets = await db.fixedAssets.getAll("fp-target");
      expect(assets.map((asset) => asset.name)).toEqual(["Camera"]);
    });

    it("applyCarryover leaves unselected items untouched", async () => {
      const db = await ctx.makeSeededAdapter(carryoverSeed("journalizing"));
      const before = await db.fiscalPeriods.getById("fp-target");

      const updated = await db.fiscalPeriods.applyCarryover("fp-target", {
        sourceFiscalPeriodId: "fp-source",
        carryBalances: false,
        reversalEntryIds: null,
        carryFixedAssets: true,
      });

      expect(updated.opening).toEqual(before!.opening);
      const assets = await db.fixedAssets.getAll("fp-target");
      expect(assets.map((asset) => asset.name)).toEqual(["Camera"]);
    });

    it("applyCarryover rejects a pre-closed target without changes", async () => {
      const db = await ctx.makeSeededAdapter(carryoverSeed("pre_closing"));
      const before = await db.fiscalPeriods.getById("fp-target");

      await expect(
        db.fiscalPeriods.applyCarryover("fp-target", {
          sourceFiscalPeriodId: "fp-source",
          carryBalances: true,
          reversalEntryIds: null,
          carryFixedAssets: true,
        }),
      ).rejects.toThrow();

      expect(await db.fiscalPeriods.getById("fp-target")).toEqual(before);
      expect(await db.fixedAssets.getAll("fp-target")).toHaveLength(1);
    });

    it("applyCarryover rejects a source that is not fully closed", async () => {
      const seed = carryoverSeed("journalizing");
      seed.fiscalPeriods[0] = {
        ...seed.fiscalPeriods[0]!,
        documentsReceivedCompleted: false,
      };
      const db = await ctx.makeSeededAdapter(seed);

      await expect(
        db.fiscalPeriods.applyCarryover("fp-target", {
          sourceFiscalPeriodId: "fp-source",
          carryBalances: true,
          reversalEntryIds: null,
          carryFixedAssets: false,
        }),
      ).rejects.toThrow();
    });

    function sourceArchive(seed: DbSnapshot): FiscalPeriodArchiveDbImportInput {
      const source = seed.fiscalPeriods.find(
        (period) => period.id === "fp-source",
      )!;
      return {
        fiscalPeriod: {
          name: source.name,
          startDate: source.startDate,
          endDate: source.endDate,
          phase: source.phase,
          openingBalancesCompleted: source.openingBalancesCompleted,
          documentsReceivedCompleted: source.documentsReceivedCompleted,
          opening: source.opening,
        },
        entries: seed.entries
          .filter((entry) => entry.fiscalPeriodId === "fp-source")
          .map((entry) => ({
            date: entry.date,
            description: entry.description,
            localId: entry.localId,
            businessRate: entry.businessRate,
            lines: entry.lines.map(({ id: _id, ...line }) => line),
          })),
        fixedAssets: seed.fixedAssets
          .filter((asset) => asset.fiscalPeriodId === "fp-source")
          .map((asset) => ({
            name: asset.name,
            acquisitionDate: asset.acquisitionDate,
            acquisitionCost: asset.acquisitionCost,
            usefulLife: asset.usefulLife,
            depreciationMethod: asset.depreciationMethod,
            businessRate: asset.businessRate,
            status: asset.status,
            disposalDate: asset.disposalDate,
            disposalPrice: asset.disposalPrice,
            bookAccountId: asset.bookAccountId,
          })),
      };
    }

    function targetOnlyBook(seed: DbSnapshot): DbSnapshot {
      return {
        fiscalPeriods: seed.fiscalPeriods.filter(
          (period) => period.id !== "fp-source",
        ),
        entries: seed.entries.filter(
          (entry) => entry.fiscalPeriodId !== "fp-source",
        ),
        fixedAssets: seed.fixedAssets.filter(
          (asset) => asset.fiscalPeriodId !== "fp-source",
        ),
      };
    }

    it("applyCarryoverFromArchive carries a period kept in another book", async () => {
      const seed = carryoverSeed("journalizing");
      const db = await ctx.makeSeededAdapter(targetOnlyBook(seed));

      const updated = await db.fiscalPeriods.applyCarryoverFromArchive(
        "fp-target",
        {
          archive: sourceArchive(seed),
          carryBalances: true,
          reversalEntryIndexes: [1],
          carryFixedAssets: true,
        },
      );

      expect(updated.openingBalancesCompleted).toBe(true);
      expect(updated.opening.balanceLines).toEqual(
        expect.arrayContaining([
          { id: "a:現金", accountId: "a:現金", amount: 6000 },
          { id: "l:元入金", accountId: "l:元入金", amount: 5700 },
        ]),
      );
      expect(updated.opening.journals).toHaveLength(1);
      expect(updated.opening.journals[0]!.date).toBe("2027-01-01");
      expect(await db.fiscalPeriods.getById("fp-target")).toEqual(updated);
      const assets = await db.fixedAssets.getAll("fp-target");
      expect(assets.map((asset) => asset.name)).toEqual(["Camera"]);
      expect(await db.fiscalPeriods.getAll("user-1")).toHaveLength(1);
    });

    it("applyCarryoverFromArchive leaves unselected items untouched", async () => {
      const seed = carryoverSeed("journalizing");
      const db = await ctx.makeSeededAdapter(targetOnlyBook(seed));
      const before = await db.fiscalPeriods.getById("fp-target");

      const updated = await db.fiscalPeriods.applyCarryoverFromArchive(
        "fp-target",
        {
          archive: sourceArchive(seed),
          carryBalances: false,
          reversalEntryIndexes: null,
          carryFixedAssets: true,
        },
      );

      expect(updated.opening).toEqual(before!.opening);
      const assets = await db.fixedAssets.getAll("fp-target");
      expect(assets.map((asset) => asset.name)).toEqual(["Camera"]);
    });

    it("applyCarryoverFromArchive rejects an archive that is not fully closed", async () => {
      const seed = carryoverSeed("journalizing");
      const db = await ctx.makeSeededAdapter(targetOnlyBook(seed));
      const before = await db.fiscalPeriods.getById("fp-target");
      const archive = sourceArchive(seed);

      await expect(
        db.fiscalPeriods.applyCarryoverFromArchive("fp-target", {
          archive: {
            ...archive,
            fiscalPeriod: {
              ...archive.fiscalPeriod,
              documentsReceivedCompleted: false,
            },
          },
          carryBalances: true,
          reversalEntryIndexes: null,
          carryFixedAssets: true,
        }),
      ).rejects.toThrow();

      expect(await db.fiscalPeriods.getById("fp-target")).toEqual(before);
      expect(await db.fixedAssets.getAll("fp-target")).toHaveLength(1);
    });

    it("applyCarryoverFromArchive rejects a reversal entry outside the archive", async () => {
      const seed = carryoverSeed("journalizing");
      const db = await ctx.makeSeededAdapter(targetOnlyBook(seed));
      const before = await db.fiscalPeriods.getById("fp-target");

      await expect(
        db.fiscalPeriods.applyCarryoverFromArchive("fp-target", {
          archive: sourceArchive(seed),
          carryBalances: true,
          reversalEntryIndexes: [5],
          carryFixedAssets: true,
        }),
      ).rejects.toThrow();

      expect(await db.fiscalPeriods.getById("fp-target")).toEqual(before);
      expect(await db.fixedAssets.getAll("fp-target")).toHaveLength(1);
    });

    it("deletes child entries and fixed assets with the fiscal period", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await db.fiscalPeriods.start(period.id);
      await db.fiscalPeriods.patch(period.id, {
        openingBalancesCompleted: true,
      });
      await db.entries.create("user-1", period.id, {
        date: "2026-04-01",
        description: "entry",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
        localId: null,
      });
      await db.fixedAssets.create("user-1", period.id, {
        name: "Camera",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 100000,
        usefulLife: 3,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      });
      await db.preClosings.run(period.id);

      await db.fiscalPeriods.remove(period.id);

      expect(await db.fiscalPeriods.getById(period.id)).toBeNull();
      expect(await db.entries.getAll(period.id)).toEqual([]);
      expect(await db.fixedAssets.getAll(period.id)).toEqual([]);
    });

    it("keeps a fiscal period whose data was purged as it is and refuses to change it", async () => {
      const purgedPeriod = {
        ...seedWithPeriods("fp-purged").fiscalPeriods[0]!,
        phase: "post_closing" as const,
        documentsReceivedCompleted: true,
        archiveStatus: "purged" as const,
        archivedAt: "2027-03-01T00:00:00.000Z",
      };
      const db = await ctx.makeSeededAdapter({
        fiscalPeriods: [purgedPeriod],
        entries: [],
        fixedAssets: [],
      });

      const stored = await db.fiscalPeriods.getById("fp-purged");

      expect(stored?.archiveStatus).toBe("purged");
      await expect(
        db.fiscalPeriods.patch("fp-purged", { name: "renamed" }),
      ).rejects.toThrow(/purged fiscal period cannot be updated/);
      await expect(
        db.fiscalPeriods.create("user-1", {
          name: "same dates",
          startDate: purgedPeriod.startDate,
          endDate: purgedPeriod.endDate,
        }),
      ).resolves.toMatchObject({ archiveStatus: "active" });
    });

    it("imports archived fiscal periods with child records in one operation", async () => {
      const db = await makeDb();
      const archiveInput: FiscalPeriodArchiveDbImportInput = {
        fiscalPeriod: {
          name: "Archived FY2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "post_closing",
          openingBalancesCompleted: true,
          documentsReceivedCompleted: true,
          opening: { balanceLines: [], journals: [] },
        },
        entries: [
          {
            date: "2026-04-01",
            description: "imported entry",
            localId: "source-entry-1",
            businessRate: 1,
            lines: [testEntryLine, testCreditEntryLine],
          },
        ],
        fixedAssets: [
          {
            name: "Imported Camera",
            acquisitionDate: "2026-04-01",
            acquisitionCost: 100000,
            usefulLife: 3,
            depreciationMethod: "straight_line",
            businessRate: 1,
            bookAccountId: "acct_equipment",
            status: "sold",
            disposalDate: "2026-12-01",
            disposalPrice: 50000,
          },
        ],
      };
      const imported = await db.fiscalPeriods.importArchived(
        "user-1",
        archiveInput,
      );

      expect(imported.archiveStatus).toBe("active");
      expect(imported.phase).toBe("post_closing");
      expect(await db.fiscalPeriods.getAll("user-1")).toEqual([imported]);
      expect(await db.entries.getAll(imported.id)).toHaveLength(1);
      expect((await db.fixedAssets.getAll(imported.id))[0]).toMatchObject({
        name: "Imported Camera",
        status: "sold",
        disposalDate: "2026-12-01",
      });
      await expect(
        db.fiscalPeriods.importArchived("user-1", archiveInput),
      ).rejects.toThrow(/overlaps active fiscal period/);
      expect(await db.fiscalPeriods.getAll("user-1")).toHaveLength(1);
    });

    it("rejects an invalid archived child record without importing the period", async () => {
      const db = await makeDb();
      const archiveInput: FiscalPeriodArchiveDbImportInput = {
        fiscalPeriod: {
          name: "Invalid archive",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          openingBalancesCompleted: true,
          documentsReceivedCompleted: false,
          opening: { balanceLines: [], journals: [] },
        },
        entries: [
          {
            date: "2027-01-01",
            description: "outside period",
            businessRate: 1,
            lines: [testEntryLine, testCreditEntryLine],
            localId: null,
          },
        ],
        fixedAssets: [],
      };

      await expect(
        db.fiscalPeriods.importArchived("user-1", archiveInput),
      ).rejects.toThrow(/must be within fiscal period/);
      expect(await db.fiscalPeriods.getAll("user-1")).toEqual([]);
    });

    it("rejects oversized archive data before importing", async () => {
      const db = await makeDb();
      const base: FiscalPeriodArchiveDbImportInput = {
        fiscalPeriod: {
          name: "Oversized archive",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          openingBalancesCompleted: false,
          documentsReceivedCompleted: false,
          opening: { balanceLines: [], journals: [] },
        },
        entries: [],
        fixedAssets: [],
      };
      const entry = {
        date: "2026-04-01",
        description: "a".repeat(MAX_FISCAL_PERIOD_ARCHIVE_FILE_BYTES),
        localId: null,
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      };

      await expect(
        db.fiscalPeriods.importArchived("user-1", {
          ...base,
          entries: [entry],
        }),
      ).rejects.toThrow(/archive exceeds the size limit/);

      expect(await db.fiscalPeriods.getAll("user-1")).toEqual([]);
    });
  });

  describe(`OpenkkDbPort conformance [${label}] / entries`, () => {
    it.each(["create", "update", "importMany"] as const)(
      "rejects an omitted localId on %s",
      async (operation) => {
        const db = await makeDb();
        const period = await createTestFiscalPeriod(db);
        const input = testEntryInput(null, "Imported entry");
        const original = await db.entries.create("user-1", period.id, input);
        Reflect.deleteProperty(input, "localId");

        const result =
          operation === "create"
            ? db.entries.create("user-1", period.id, input)
            : operation === "update"
              ? db.entries.update(original.id, input)
              : db.entries.importMany("user-1", period.id, [input]);

        await expect(result).rejects.toMatchObject({ statusCode: 400 });
        expect(await db.entries.getAll(period.id)).toEqual([original]);
      },
    );

    it("rejects an entry whose fiscal period does not exist", async () => {
      const db = await makeDb();
      await expect(
        db.entries.create("user-1", "missing", {
          date: "2026-04-01",
          description: "orphan",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
          localId: null,
        }),
      ).rejects.toThrow(/fiscal period not found/);
    });

    it("enforces balanced integer entries and period dates at the persistence boundary", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const base = {
        date: "2026-04-01",
        description: "invalid entry",
        businessRate: 1,
        localId: null,
      };

      await expect(
        db.entries.create("user-1", period.id, {
          ...base,
          lines: [testEntryLine],
        }),
      ).rejects.toThrow(/positive debit and credit lines/);
      await expect(
        db.entries.create("user-1", period.id, {
          ...base,
          lines: [
            { ...testEntryLine, amount: 1000.5 },
            { ...testCreditEntryLine, amount: 1000.5 },
          ],
        }),
      ).rejects.toThrow(/safe integer/);
      await expect(
        db.entries.create("user-1", period.id, {
          ...base,
          date: "2027-01-01",
          lines: [testEntryLine, testCreditEntryLine],
        }),
      ).rejects.toThrow(/must be within fiscal period/);
      await expect(
        db.entries.create("user-1", period.id, {
          ...base,
          lines: Array.from(
            { length: MAX_ENTRY_LINES + 1 },
            () => testEntryLine,
          ),
        }),
      ).rejects.toThrow(/1,000 line limit/);

      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("rejects unknown book-account references at the persistence boundary", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);

      await expect(
        db.entries.create("user-1", period.id, {
          date: "2026-04-01",
          description: "invalid account reference",
          businessRate: 1,
          lines: [
            { ...testEntryLine, bookAccountId: "unknown-account" },
            testCreditEntryLine,
          ],
          localId: null,
        }),
      ).rejects.toThrow(/references unknown/);

      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("round-trips custom entry-line categories", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);

      const created = await db.entries.create("user-1", period.id, {
        date: "2026-04-01",
        description: "custom categories",
        businessRate: 1,
        lines: [
          {
            ...testEntryLine,
            taxCategoryId: "custom-tax",
            businessCategoryId: "custom-business",
          },
          testCreditEntryLine,
        ],
        localId: null,
      });

      expect(created.lines[0]).toMatchObject({
        taxCategoryId: "custom-tax",
        businessCategoryId: "custom-business",
      });
      await expect(db.entries.getAll(period.id)).resolves.toEqual([created]);
    });

    it("rejects a child write whose user does not own the fiscal period", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);

      await expect(
        db.entries.create("user-2", period.id, {
          date: "2026-04-01",
          description: "wrong owner",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
          localId: null,
        }),
      ).rejects.toThrow(/fiscal period not found/);
      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("creates, filters, updates, and deletes entries", async () => {
      const db = await makeDb();
      const firstPeriod = await createTestFiscalPeriod(db);
      const secondCreated = await db.fiscalPeriods.create("user-1", {
        name: "Second",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      });
      await db.fiscalPeriods.start(secondCreated.id);
      const secondPeriod = await db.fiscalPeriods.patch(secondCreated.id, {
        openingBalancesCompleted: true,
      });
      const original = await db.entries.create("user-1", firstPeriod.id, {
        date: "2026-04-15",
        description: "before",
        localId: "local-1",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      });
      await db.entries.create("user-1", secondPeriod.id, {
        date: "2027-04-16",
        description: "other fp",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
        localId: null,
      });

      expect(
        (await db.entries.getAll(firstPeriod.id)).map((entry) => entry.id),
      ).toEqual([original.id]);

      const updated = await db.entries.update(original.id, {
        date: "2026-05-01",
        description: "after",
        businessRate: 0.5,
        lines: [
          { ...testEntryLine, amount: 2000 },
          { ...testCreditEntryLine, amount: 2000 },
        ],
        localId: null,
      });
      expect(updated.id).toBe(original.id);
      expect(updated.description).toBe("after");
      expect(updated.businessRate).toBe(0.5);

      await db.entries.remove(original.id);
      expect(await db.entries.getById(original.id)).toBeNull();
    });

    it("preserves a null localId when reading and updating an entry", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const created = await db.entries.create("user-1", period.id, {
        date: "2026-04-15",
        description: "without external id",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
        localId: null,
      });

      expect((await db.entries.getById(created.id))?.localId).toBeNull();

      const updated = await db.entries.update(created.id, {
        date: "2026-04-16",
        description: "updated without external id",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
        localId: null,
      });
      expect(updated.localId).toBeNull();
      expect(updated.description).toBe("updated without external id");

      await db.entries.remove(created.id);
      expect(await db.entries.getById(created.id)).toBeNull();
    });

    it("importMany creates entries in input order", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const created = await db.entries.importMany("user-1", period.id, [
        {
          date: "2026-04-01",
          description: "first",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
          localId: null,
        },
        {
          date: "2026-04-02",
          description: "second",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
          localId: null,
        },
      ]);

      expect(created.map((entry) => entry.description)).toEqual([
        "first",
        "second",
      ]);
    });

    it("rejects an invalid import batch atomically", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);

      await expect(
        db.entries.importMany("user-1", period.id, [
          {
            date: "2026-04-01",
            description: "valid",
            businessRate: 1,
            lines: [testEntryLine, testCreditEntryLine],
            localId: null,
          },
          {
            date: "2026-04-02",
            description: "invalid",
            businessRate: 1,
            lines: [testEntryLine],
            localId: null,
          },
        ]),
      ).rejects.toThrow(/positive debit and credit lines/);

      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("rejects an oversized import line total before allocating records", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const repeatedLines = Array.from(
        { length: MAX_ENTRY_LINES },
        () => testEntryLine,
      );
      const oversized = Array.from(
        { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
        (_, index) => ({
          date: "2026-04-01",
          description: `many lines ${index}`,
          businessRate: 1,
          lines: repeatedLines,
          localId: null,
        }),
      );

      await expect(
        db.entries.importMany("user-1", period.id, oversized),
      ).rejects.toThrow(/100,000 line limit/);
      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("importMany is idempotent on localId across calls and within a batch", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const first = await db.entries.importMany("user-1", period.id, [
        {
          date: "2026-04-01",
          description: "a",
          localId: "L1",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        },
        {
          date: "2026-04-02",
          description: "b",
          localId: "L2",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        },
      ]);
      expect(first).toHaveLength(2);

      const second = await db.entries.importMany("user-1", period.id, [
        {
          date: "2026-04-01",
          description: "a-again",
          localId: "L1",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        },
        {
          date: "2026-04-03",
          description: "c",
          localId: "L3",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        },
        {
          date: "2026-04-03",
          description: "c-dup",
          localId: "L3",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        },
      ]);
      expect(second.map((entry) => entry.description)).toEqual(["c"]);
      expect(await db.entries.getAll(period.id)).toHaveLength(3);
    });

    it("enforces localId uniqueness within a fiscal period", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const input = {
        date: "2026-04-01",
        description: "source entry",
        localId: "same-source-id",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      };
      await db.entries.create("user-1", period.id, input);
      const other = await db.entries.create("user-1", period.id, {
        ...input,
        localId: "other-source-id",
      });

      await expect(
        db.entries.create("user-1", period.id, input),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(db.entries.update(other.id, input)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(await db.entries.getById(other.id)).toEqual(other);
    });

    it("rejects a blank localId instead of treating it as a unique value", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);

      await expect(
        db.entries.create("user-1", period.id, {
          date: "2026-04-01",
          description: "blank local id",
          localId: "",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        }),
      ).rejects.toThrow(/localId must be a non-blank string/);
      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("importMany always inserts entries without a localId", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const created = await db.entries.importMany("user-1", period.id, [
        {
          date: "2026-04-01",
          description: "x",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
          localId: null,
        },
        {
          date: "2026-04-01",
          description: "y",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
          localId: null,
        },
      ]);
      expect(created).toHaveLength(2);
    });

    it("imports a large batch without changing input order", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const inputs = Array.from({ length: 501 }, (_, index) => ({
        date: "2026-04-01",
        description: `entry-${index}`,
        localId: `local-${index}`,
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      }));

      const created = await db.entries.importMany("user-1", period.id, inputs);

      expect(created).toHaveLength(501);
      expect(created.map(({ description }) => description)).toEqual(
        inputs.map(({ description }) => description),
      );
    });
  });

  describe(`OpenkkDbPort conformance [${label}] / fixedAssets`, () => {
    it("rejects a fixed asset whose fiscal period does not exist", async () => {
      const db = await makeDb();
      await expect(
        db.fixedAssets.create("user-1", "missing", {
          name: "Camera",
          acquisitionDate: "2026-04-01",
          acquisitionCost: 100000,
          usefulLife: 3,
          depreciationMethod: "straight_line",
          businessRate: 1,
          bookAccountId: "acct_equipment",
        }),
      ).rejects.toThrow(/fiscal period not found/);
    });

    it("create / getAll / patch / remove round-trip", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const asset = await db.fixedAssets.create("user-1", period.id, {
        name: "Camera",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 100000,
        usefulLife: 3,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      });

      expect(await db.fixedAssets.getAll(period.id)).toEqual([asset]);

      const updated = await db.fixedAssets.patch(asset.id, {
        businessRate: 0.7,
        status: "disposed",
        disposalDate: "2026-12-31",
        disposalPrice: null,
      });
      expect(updated).toMatchObject({
        businessRate: 0.7,
        status: "disposed",
        disposalDate: "2026-12-31",
        disposalPrice: null,
        name: "Camera",
      });

      await db.fixedAssets.remove(asset.id);
      expect(await db.fixedAssets.getAll(period.id)).toEqual([]);
    });

    it("rejects inconsistent, zero-cost, and wrong-owner fixed assets", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const base = {
        name: "Camera",
        acquisitionDate: "2026-04-01",
        acquisitionCost: 100000,
        usefulLife: 3,
        depreciationMethod: "straight_line" as const,
        businessRate: 1,
        bookAccountId: "acct_equipment",
      };

      await expect(
        db.fixedAssets.create("user-2", period.id, base),
      ).rejects.toThrow(/fiscal period not found/);
      await expect(
        db.fixedAssets.create("user-1", period.id, {
          ...base,
          acquisitionCost: 0,
        }),
      ).rejects.toThrow(/positive integer/);
      await expect(
        db.fixedAssets.create("user-1", period.id, {
          ...base,
          usefulLife: MAX_FIXED_ASSET_USEFUL_LIFE_YEARS + 1,
        }),
      ).rejects.toThrow(/must not exceed 100 years/);

      const asset = await db.fixedAssets.create("user-1", period.id, base);
      await expect(
        db.fixedAssets.patch(asset.id, {
          status: "disposed",
          disposalDate: "2026-12-31",
          disposalPrice: 20000,
        }),
      ).rejects.toThrow(/must not have a disposal price/);
      expect(await db.fixedAssets.getById(asset.id)).toMatchObject({
        status: "active",
        disposalDate: null,
        disposalPrice: null,
      });
    });
  });

  describe(`OpenkkDbPort conformance [${label}] / closings`, () => {
    it("rejects a closing whose fiscal period does not exist", async () => {
      const db = await makeDb();
      await expect(db.preClosings.run("missing")).rejects.toThrow(
        /fiscal period not found/,
      );
    });

    it("commits generated entries and final closing in one transition", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.entries.importMany("user-1", period.id, [
        testEntryInput("virtual:stored", "stored generated entry"),
      ]);
      await db.preClosings.run(period.id);

      const closed = await db.closings.run(period.id, [
        testEntryInput("virtual:final", "final generated entry"),
      ]);

      expect(closed.phase).toBe("post_closing");
      expect(
        (await db.entries.getAll(period.id)).map((entry) => entry.localId),
      ).toEqual(["virtual:final"]);
      await expect(
        db.entries.create(
          "user-1",
          period.id,
          testEntryInput("ordinary", "late entry"),
        ),
      ).rejects.toThrow(/cannot create entry from phase post_closing/);
      await expect(
        db.fixedAssets.create("user-1", period.id, {
          name: "late asset",
          acquisitionDate: "2026-12-31",
          acquisitionCost: 1000,
          usefulLife: 1,
          depreciationMethod: "straight_line",
          businessRate: 1,
          bookAccountId: "acct_equipment",
        }),
      ).rejects.toThrow(/cannot create fixed asset from phase post_closing/);
      await expect(
        db.fiscalPeriods.patch(period.id, { name: "late rename" }),
      ).rejects.toThrow(
        /only allows document receipt completion after closing/,
      );
    });

    it("rejects non-generated or invalid closing entries before replacing data", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.preClosings.run(period.id);

      await expect(
        db.closings.run(period.id, [
          testEntryInput("ordinary", "not generated"),
        ]),
      ).rejects.toThrow(/reserved generated prefix/);

      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
    });

    it("rejects oversized generated closing batches before persistence", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.preClosings.run(period.id);
      const entry = testEntryInput("virtual:limit", "limit");

      await expect(
        db.closings.run(
          period.id,
          Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(entry),
        ),
      ).rejects.toThrow(/Closing entries exceed the 10,000 item limit/);

      const manyLines = Array(MAX_ENTRY_LINES).fill(testEntryLine);
      await expect(
        db.closings.run(
          period.id,
          Array(MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1).fill({
            ...entry,
            lines: manyLines,
          }),
        ),
      ).rejects.toThrow(/Closing entries exceed the 100,000 line limit/);
      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
    });

    it.each(["cancel", "close"])(
      "preserves ordinary entry identifiers with different casing on %s",
      async (operation) => {
        const db = await makeDb();
        const period = await createTestFiscalPeriod(db);
        const inputs = [
          "Virtual:import",
          "VIRTUAL:import",
          "ordinary",
          null,
        ].map((localId) => testEntryInput(localId, "Imported entry"));
        const ordinaryEntries = await db.entries.importMany(
          "user-1",
          period.id,
          inputs,
        );
        await db.preClosings.run(period.id);

        if (operation === "cancel") {
          await db.preClosings.cancel(period.id);
        } else {
          await db.closings.run(period.id, []);
        }

        const persisted = await db.entries.getAll(period.id);
        expect(persisted).toHaveLength(ordinaryEntries.length);
        expect(persisted).toEqual(expect.arrayContaining(ordinaryEntries));
      },
    );

    it("removes stored generated entries when pre-closing is cancelled", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.entries.importMany("user-1", period.id, [
        testEntryInput("virtual:stored", "stored generated entry"),
      ]);
      await db.preClosings.run(period.id);

      const reopened = await db.preClosings.cancel(period.id);

      expect(reopened.phase).toBe("journalizing");
      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("rolls back generated entry replacement when final closing fails", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.entries.importMany("user-1", period.id, [
        testEntryInput("virtual:stored", "stored generated entry"),
      ]);
      await db.preClosings.run(period.id);
      const duplicate = testEntryInput(
        "virtual:duplicate",
        "duplicate generated entry",
      );

      await expect(
        db.closings.run(period.id, [duplicate, duplicate]),
      ).rejects.toThrow(/duplicate localIds/);

      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
      expect(
        (await db.entries.getAll(period.id)).map((entry) => entry.localId),
      ).toEqual(["virtual:stored"]);
    });
  });

  describe(`OpenkkDbPort conformance [${label}] / seed`, () => {
    it("loads stable seed records", async () => {
      const seed: DbSnapshot = {
        fiscalPeriods: [
          {
            id: "fp-seed",
            userId: "user-1",
            name: "Seed",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            phase: "pre_opening",
            archiveStatus: "active",
            openingBalancesCompleted: false,
            documentsReceivedCompleted: false,
            opening: emptyOpening(),
            createdAt: "1970-01-01T00:00:00.000Z",
            updatedAt: "1970-01-01T00:00:00.000Z",
            archivedAt: null,
          },
        ],
        entries: [],
        fixedAssets: [],
      };
      const db = await ctx.makeSeededAdapter(seed);

      expect(
        (await db.fiscalPeriods.getAll("user-1")).map((period) => period.id),
      ).toEqual(["fp-seed"]);
    });

    it("rejects invalid seeded child data before exposing the adapter", async () => {
      const seed = seedWithPeriods("fp-seed-invalid");
      seed.entries = [
        {
          id: "entry-invalid",
          userId: "user-1",
          fiscalPeriodId: "fp-seed-invalid",
          date: "2026-04-01",
          description: "unbalanced",
          localId: "invalid-seed-entry",
          businessRate: 1,
          lines: [{ id: "line-1", ...testEntryLine }],
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      ];

      await expect(ctx.makeSeededAdapter(seed)).rejects.toThrow(
        /positive debit and credit lines/,
      );
    });

    it("rejects a malformed seeded entry identity as validation failure", async () => {
      const seed = seedWithPeriods("fp-malformed-entry");
      seed.entries = [
        {
          id: undefined as unknown as string,
          userId: "user-1",
          fiscalPeriodId: "fp-malformed-entry",
          date: "2026-04-01",
          description: "malformed identity",
          localId: "malformed-identity",
          businessRate: 1,
          lines: [
            { id: "line-1", ...testEntryLine },
            { id: "line-2", ...testCreditEntryLine },
          ],
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      ];

      await expect(ctx.makeSeededAdapter(seed)).rejects.toMatchObject({
        name: "AppError",
        statusCode: 400,
      });
    });

    it("rejects missing parents, ownership mismatches, and overlapping active seed periods", async () => {
      const missingParent = seedWithPeriods("fp-valid");
      missingParent.entries = [
        {
          id: "entry-orphan",
          userId: "user-1",
          fiscalPeriodId: "fp-missing",
          date: "2026-04-01",
          description: "orphan",
          localId: "orphan",
          businessRate: 1,
          lines: [
            { id: "line-1", ...testEntryLine },
            { id: "line-2", ...testCreditEntryLine },
          ],
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      ];
      await expect(ctx.makeSeededAdapter(missingParent)).rejects.toThrow(
        /Seed fiscal period not found/,
      );

      const wrongOwner = seedWithPeriods("fp-wrong-owner");
      wrongOwner.entries = missingParent.entries.map((entry) => ({
        ...entry,
        fiscalPeriodId: "fp-wrong-owner",
        userId: "user-2",
      }));
      await expect(ctx.makeSeededAdapter(wrongOwner)).rejects.toThrow(
        /Seed record owner does not match/,
      );

      await expect(
        ctx.makeSeededAdapter(seedWithPeriods("fp-overlap-1", "fp-overlap-2")),
      ).rejects.toThrow(/overlaps active fiscal period/);
    });

    it("rejects out-of-period children", async () => {
      const invalidDate = seedWithPeriods("fp-invalid-date");
      invalidDate.entries = [
        {
          id: "entry-invalid-date",
          userId: "user-1",
          fiscalPeriodId: "fp-invalid-date",
          date: "2027-01-01",
          description: "outside period",
          localId: "outside-period",
          businessRate: 1,
          lines: [
            { id: "line-1", ...testEntryLine },
            { id: "line-2", ...testCreditEntryLine },
          ],
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      ];
      await expect(ctx.makeSeededAdapter(invalidDate)).rejects.toThrow(
        /must be within fiscal period/,
      );
    });
  });
}
