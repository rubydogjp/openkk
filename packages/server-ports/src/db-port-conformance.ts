import { describe, expect, it } from "vitest";
import {
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  MAX_ENTRY_LINES,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
} from "@rubydogjp/openkk-server-domain";

import type { OpenkkDbPort } from "./db-adapter.js";
import type { FiscalPeriodArchiveDbImportInput } from "./persistence-types.js";
import type { DbSnapshot } from "./sqlite/adapter.js";

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

function closingGeneratedEntry(localId: string, description: string) {
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

  async function createTestFiscalPeriod(
    db: OpenkkDbPort,
    userId = "user-1",
    name = "Test period",
  ) {
    const created = await db.fiscalPeriods.create(userId, {
      name,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    return db.fiscalPeriods.update(created.id, {
      settingsCompleted: true,
      openingBalancesCompleted: true,
    });
  }

  function seedWithPeriods(...ids: string[]): DbSnapshot {
    return {
      fiscalPeriods: ids.map((id) => ({
        userId: "user-1",
        record: {
          id,
          userId: "user-1",
          name: id,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          archiveStatus: "active",
          settingsCompleted: true,
          openingBalancesCompleted: true,
          documentsReceivedCompleted: false,
          opening: null,
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      })),
      entries: [],
      fixedAssets: [],
      preClosings: [],
      closings: [],
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

      expect(created.id).toMatch(/^fp_/);
      expect(created.name).toBe("FY2026");
      expect(created.phase).toBe("pre_opening");
      expect(created.settingsCompleted).toBe(false);
      expect(created.opening).toEqual({
        id: `op-${created.id}`,
        userId: "user-1",
        fiscalPeriodId: created.id,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        openingBalanceLines: [],
        openingJournals: [],
      });
      expect(await db.fiscalPeriods.getById(created.id)).toEqual(created);
    });

    it("getAllByUser filters by userId", async () => {
      const db = await makeDb();
      const a = await db.fiscalPeriods.create("user-A", {
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
        (await db.fiscalPeriods.getAllByUser("user-A")).map((r) => r.id),
      ).toEqual([a.id]);
      expect(
        (await db.fiscalPeriods.getAllByUser("user-B")).map((r) => r.name),
      ).toEqual(["B1"]);
    });

    it("serializes concurrent transactions on one SQLite connection", async () => {
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
      expect(await db.fiscalPeriods.getAllByUser("user-1")).toHaveLength(2);
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
        db.fiscalPeriods.update(next.id, { startDate: first.endDate }),
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

      expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);
    });

    it("update only patches provided fields", async () => {
      const db = await makeDb();
      const created = await db.fiscalPeriods.create("user-1", {
        name: "Original",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      const updated = await db.fiscalPeriods.update(created.id, {
        name: "Renamed",
        settingsCompleted: true,
      });
      expect(updated.name).toBe("Renamed");
      expect(updated.settingsCompleted).toBe(true);
      expect(updated.startDate).toBe("2026-01-01");
      expect(updated.endDate).toBe("2026-12-31");
    });

    it("round-trips normalized opening data", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const opening = {
        ...period.opening!,
        openingBalanceLines: [
          { id: "balance-1", accountId: "a:現金", amount: 1000 },
          { id: "balance-2", accountId: "l:元入金", amount: 1000 },
        ],
        openingJournals: [
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

      await new Promise((resolve) => setTimeout(resolve, 2));
      const updated = await db.fiscalPeriods.update(period.id, { opening });

      // updatedAt advances on write; createdAt stays immutable, and the persisted
      // record must match what update() returned (regression: replaceOpening used
      // to reset created_at on every patch).
      expect(updated.opening).toEqual({
        ...opening,
        updatedAt: updated.opening!.updatedAt,
      });
      expect(updated.opening!.createdAt).toBe(opening.createdAt);
      expect((await db.fiscalPeriods.getById(period.id))?.opening).toEqual(
        updated.opening,
      );
      expect(
        (await db.fiscalPeriods.getAllByUser("user-1"))[0]?.opening,
      ).toEqual(updated.opening);
    });

    it("allows opening-journal drafts but enforces finalization at the persistence boundary", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "Draft opening period",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      const draftOpening = {
        ...period.opening!,
        openingBalanceLines: [],
        openingJournals: [
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

      const withDraft = await db.fiscalPeriods.update(period.id, {
        opening: draftOpening,
      });
      expect(withDraft.opening?.openingJournals?.[0]?.description).toBe("");

      await expect(
        db.fiscalPeriods.update(period.id, {
          openingBalancesCompleted: true,
        }),
      ).rejects.toThrow(/description is required/);
      await expect(
        db.fiscalPeriods.update(period.id, {
          openingBalancesCompleted: true,
          opening: {
            ...draftOpening,
            openingJournals: draftOpening.openingJournals.map((journal) => ({
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
        ...period.opening!,
        openingBalanceLines: [
          { id: "balance-1", accountId: "a:現金", amount: 1000 },
          { id: "balance-2", accountId: "a:現金", amount: 2000 },
        ],
        openingJournals: [],
      };

      await expect(
        db.fiscalPeriods.update(period.id, {
          openingBalancesCompleted: true,
          opening: invalidOpening,
        }),
      ).rejects.toThrow(/duplicate accountId|must be unique/);

      expect(await db.fiscalPeriods.getById(period.id)).toEqual(period);
    });

    it("rejects opening identity, range, and completed-balance inconsistencies atomically", async () => {
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
        ...period.opening!,
        openingBalanceLines: [],
        openingJournals: [balancedJournal],
      };
      const withOpening = await db.fiscalPeriods.update(period.id, { opening });

      await expect(
        db.fiscalPeriods.update(period.id, {
          opening: { ...opening, id: "replacement-opening" },
        }),
      ).rejects.toThrow(/identity and ownership/);
      await expect(
        db.fiscalPeriods.update(period.id, { startDate: "2026-02-01" }),
      ).rejects.toThrow(/Opening journal date .* must be within fiscal period/);
      await expect(
        db.fiscalPeriods.update(period.id, {
          openingBalancesCompleted: true,
          opening: {
            ...opening,
            openingBalanceLines: [
              { id: "asset", accountId: "a:現金", amount: 1000 },
              { id: "equity", accountId: "l:元入金", amount: 900 },
            ],
          },
        }),
      ).rejects.toThrow(/Opening balances must balance/);

      expect(await db.fiscalPeriods.getById(period.id)).toEqual(withOpening);
    });

    it("update throws when record not found", async () => {
      const db = await makeDb();
      await expect(
        db.fiscalPeriods.update("nonexistent", { name: "x" }),
      ).rejects.toThrow(/fiscal period not found/);
    });

    it("archives only a completed post-closing fiscal period", async () => {
      const sqlPhasePeriod = {
        ...seedWithPeriods("fp-archive").fiscalPeriods[0]!.record,
        phase: "post_closing" as const,
        documentsReceivedCompleted: true,
      };
      const phaseDb = await ctx.makeSeededAdapter({
        fiscalPeriods: [{ userId: "user-1", record: sqlPhasePeriod }],
        entries: [],
        fixedAssets: [],
        preClosings: [],
        closings: [],
      });

      const archived = await phaseDb.fiscalPeriods.archive("fp-archive");

      expect(archived.phase).toBe("post_closing");
      expect(archived.archiveStatus).toBe("archived");
    });

    it("deletes child entries, fixed assets, and closings with the fiscal period", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await db.fiscalPeriods.update(period.id, {
        settingsCompleted: true,
        openingBalancesCompleted: true,
      });
      await db.entries.create("user-1", period.id, {
        date: "2026-04-01",
        description: "entry",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
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
      await db.preClosings.run(period.id, 2026);

      await db.fiscalPeriods.delete(period.id);

      expect(await db.fiscalPeriods.getById(period.id)).toBeNull();
      expect(await db.entries.getAll(period.id)).toEqual([]);
      expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([]);
      expect(await db.preClosings.get(period.id, 2026)).toBeNull();
      expect(await db.closings.get(period.id, 2026)).toBeNull();
    });

    it("purgeArchivedData strips child data and leaves an archived stub", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await db.fiscalPeriods.update(period.id, {
        settingsCompleted: true,
        openingBalancesCompleted: true,
        opening: {
          ...period.opening!,
          openingBalanceLines: [
            { id: "balance-1", accountId: "a:現金", amount: 1000 },
            { id: "balance-2", accountId: "l:元入金", amount: 1000 },
          ],
          openingJournals: [],
        },
      });
      await db.entries.create("user-1", period.id, {
        date: "2026-04-01",
        description: "entry",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
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
      await db.preClosings.run(period.id, 2026);
      await db.closings.run(period.id, 2026, []);
      await db.fiscalPeriods.update(period.id, {
        documentsReceivedCompleted: true,
      });
      await db.fiscalPeriods.archive(period.id);

      const stub = await db.fiscalPeriods.purgeArchivedData(period.id);

      expect(stub.archiveStatus).toBe("archived");
      expect(stub.archiveDataAvailable).toBe(false);
      expect(stub.archivedAt).toEqual(expect.any(String));
      // 子データは全て削除され、期間行はスタブとして残る。
      expect(await db.entries.getAll(period.id)).toEqual([]);
      expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([]);
      expect(await db.preClosings.get(period.id, 2026)).toBeNull();
      const reloaded = await db.fiscalPeriods.getById(period.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.archiveDataAvailable).toBe(false);
      expect(reloaded?.opening?.openingBalanceLines ?? []).toEqual([]);
    });

    it("purgeArchivedData rejects a period that is not archived", async () => {
      const db = await makeDb();
      const period = await db.fiscalPeriods.create("user-1", {
        name: "active",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await expect(
        db.fiscalPeriods.purgeArchivedData(period.id),
      ).rejects.toThrow(/must be archived/);
    });

    it("imports archived fiscal periods with child records in one operation", async () => {
      const db = await makeDb();
      const archiveInput: FiscalPeriodArchiveDbImportInput = {
        fiscalPeriod: {
          name: "Archived FY2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "post_closing",
          archiveStatus: "active",
          settingsCompleted: true,
          openingBalancesCompleted: true,
          documentsReceivedCompleted: true,
          opening: undefined,
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
            createInput: {
              name: "Imported Camera",
              acquisitionDate: "2026-04-01",
              acquisitionCost: 100000,
              usefulLife: 3,
              depreciationMethod: "straight_line",
              businessRate: 1,
              bookAccountId: "acct_equipment",
            },
            patchInput: {
              status: "sold",
              disposalDate: "2026-12-01",
              disposalPrice: 50000,
            },
          },
        ],
        preClosings: [{ year: 2026 }],
        closings: [{ year: 2026 }],
      };
      const imported = await db.fiscalPeriods.importArchived(
        "user-1",
        archiveInput,
      );

      expect(imported.archiveStatus).toBe("active");
      expect(imported.phase).toBe("post_closing");
      expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([imported]);
      expect(await db.entries.getAll(imported.id)).toHaveLength(1);
      expect(
        (await db.fixedAssets.getAllByFiscalPeriod(imported.id))[0],
      ).toMatchObject({
        name: "Imported Camera",
        status: "sold",
        disposalDate: "2026-12-01",
      });
      expect(await db.preClosings.get(imported.id, 2026)).toEqual({});
      expect(await db.closings.get(imported.id, 2026)).toEqual({});
      await expect(
        db.fiscalPeriods.importArchived("user-1", archiveInput),
      ).rejects.toThrow(/overlaps active fiscal period/);
      expect(await db.fiscalPeriods.getAllByUser("user-1")).toHaveLength(1);
    });

    it("rejects an invalid archived child record without importing the period", async () => {
      const db = await makeDb();
      const archiveInput: FiscalPeriodArchiveDbImportInput = {
        fiscalPeriod: {
          name: "Invalid archive",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          archiveStatus: "active",
          settingsCompleted: true,
          openingBalancesCompleted: true,
          documentsReceivedCompleted: false,
          opening: undefined,
        },
        entries: [
          {
            date: "2027-01-01",
            description: "outside period",
            businessRate: 1,
            lines: [testEntryLine, testCreditEntryLine],
          },
        ],
        fixedAssets: [],
        preClosings: [],
        closings: [],
      };

      await expect(
        db.fiscalPeriods.importArchived("user-1", archiveInput),
      ).rejects.toThrow(/must be within fiscal period/);
      expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);

      await expect(
        db.fiscalPeriods.importArchived("user-1", {
          ...archiveInput,
          fiscalPeriod: {
            ...archiveInput.fiscalPeriod,
            phase: "post_closing",
            documentsReceivedCompleted: true,
          },
          entries: [],
          preClosings: [{ year: 2025 }],
          closings: [{ year: 2026 }],
        }),
      ).rejects.toThrow(/must match fiscal period end year 2026/);
      expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);
    });

    it("rejects oversized archived child collections before importing", async () => {
      const db = await makeDb();
      const base: FiscalPeriodArchiveDbImportInput = {
        fiscalPeriod: {
          name: "Oversized archive",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          phase: "journalizing",
          archiveStatus: "active",
          settingsCompleted: true,
          openingBalancesCompleted: false,
          documentsReceivedCompleted: false,
        },
        entries: [],
        fixedAssets: [],
        preClosings: [],
        closings: [],
      };
      const entry = {
        date: "2026-04-01",
        description: "imported entry",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      };

      await expect(
        db.fiscalPeriods.importArchived("user-1", {
          ...base,
          entries: Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(entry),
        }),
      ).rejects.toThrow(/Archived entries exceed the 10,000 item limit/);

      const repeatedLines = Array(MAX_ENTRY_LINES).fill(testEntryLine);
      await expect(
        db.fiscalPeriods.importArchived("user-1", {
          ...base,
          entries: Array.from(
            { length: MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1 },
            (_, index) => ({
              ...entry,
              description: `entry ${index}`,
              lines: repeatedLines,
            }),
          ),
        }),
      ).rejects.toThrow(/Archived journal lines exceed the 100,000 line limit/);
      expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([]);
    });
  });

  describe(`OpenkkDbPort conformance [${label}] / entries`, () => {
    it("rejects an entry whose fiscal period does not exist", async () => {
      const db = await makeDb();
      await expect(
        db.entries.create("user-1", "missing", {
          date: "2026-04-01",
          description: "orphan",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    it("enforces balanced integer entries and period dates at the persistence boundary", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const base = {
        date: "2026-04-01",
        description: "invalid entry",
        businessRate: 1,
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

    it("rejects unknown entry-line master references at the persistence boundary", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      const base = {
        date: "2026-04-01",
        description: "invalid master reference",
        businessRate: 1,
      };

      for (const line of [
        { ...testEntryLine, bookAccountId: "unknown-account" },
        { ...testEntryLine, taxCategoryId: "unknown-tax" },
        { ...testEntryLine, businessCategoryId: "unknown-business" },
      ]) {
        await expect(
          db.entries.create("user-1", period.id, {
            ...base,
            lines: [line, testCreditEntryLine],
          }),
        ).rejects.toThrow(/references unknown/);
      }

      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("rejects a child write whose user does not own the fiscal period", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db, "user-1");

      await expect(
        db.entries.create("user-2", period.id, {
          date: "2026-04-01",
          description: "wrong owner",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        }),
      ).rejects.toThrow(/fiscal period not found/);
      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("creates, filters, updates, and deletes entries", async () => {
      const db = await makeDb();
      const firstPeriod = await createTestFiscalPeriod(db, "user-1", "First");
      const secondCreated = await db.fiscalPeriods.create("user-1", {
        name: "Second",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      });
      const secondPeriod = await db.fiscalPeriods.update(secondCreated.id, {
        settingsCompleted: true,
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
      });

      expect(original.id).toMatch(/^entry_/);
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
      });
      expect(updated.id).toBe(original.id);
      expect(updated.description).toBe("after");
      expect(updated.businessRate).toBe(0.5);

      await db.entries.delete(original.id);
      expect(await db.entries.getById(original.id)).toBeNull();
    });

    it("reads, updates, and deletes an entry whose localId was omitted", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db, "user-1");
      const created = await db.entries.create("user-1", period.id, {
        date: "2026-04-15",
        description: "without external id",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      });

      expect((await db.entries.getById(created.id))?.localId).toBe("");

      const updated = await db.entries.update(created.id, {
        date: "2026-04-16",
        description: "updated without external id",
        businessRate: 1,
        lines: [testEntryLine, testCreditEntryLine],
      });
      expect(updated.localId).toBe("");
      expect(updated.description).toBe("updated without external id");

      await db.entries.delete(created.id);
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
        },
        {
          date: "2026-04-02",
          description: "second",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
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
          },
          {
            date: "2026-04-02",
            description: "invalid",
            businessRate: 1,
            lines: [testEntryLine],
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

      // Re-import L1 (existing) + L3 (new) + duplicate L3 within the batch.
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
      await expect(
        db.entries.create("user-1", period.id, input),
      ).rejects.toThrow(/UNIQUE constraint failed/);
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
        },
        {
          date: "2026-04-01",
          description: "y",
          businessRate: 1,
          lines: [testEntryLine, testCreditEntryLine],
        },
      ]);
      expect(created).toHaveLength(2);
    });

    it("imports more than one SQL chunk without changing input order", async () => {
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
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    it("create / getAllByFiscalPeriod / update / delete round-trip", async () => {
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

      expect(asset.id).toMatch(/^fa_/);
      expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([
        asset,
      ]);

      const updated = await db.fixedAssets.update(asset.id, {
        businessRate: 0.7,
        status: "disposed",
        disposalDate: "2026-12-31",
        disposalPrice: 0,
      });
      expect(updated).toMatchObject({
        businessRate: 0.7,
        status: "disposed",
        disposalDate: "2026-12-31",
        disposalPrice: 0,
        name: "Camera",
      });

      await db.fixedAssets.delete(asset.id);
      expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([]);
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
        db.fixedAssets.update(asset.id, {
          status: "disposed",
          disposalDate: "2026-12-31",
          disposalPrice: 20000,
        }),
      ).rejects.toThrow(/must not have a disposal price/);
      expect(await db.fixedAssets.getById(asset.id)).toMatchObject({
        status: "active",
        disposalDate: "",
        disposalPrice: 0,
      });
    });
  });

  describe(`OpenkkDbPort conformance [${label}] / seed and closings`, () => {
    it("rejects a closing whose fiscal period does not exist", async () => {
      const db = await makeDb();
      await expect(db.preClosings.run("missing", 2026)).rejects.toThrow(
        /fiscal period not found/,
      );
    });

    it("rejects a closing year that differs from the fiscal period end year", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);

      await expect(db.preClosings.run(period.id, 2025)).rejects.toThrow(
        /must match fiscal period end year 2026/,
      );
      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "journalizing",
      );
      expect(await db.preClosings.get(period.id, 2025)).toBeNull();

      await db.preClosings.run(period.id, 2026);
      await expect(db.preClosings.cancel(period.id, 2025)).rejects.toThrow(
        /must match fiscal period end year 2026/,
      );
      await expect(db.closings.run(period.id, 2025, [])).rejects.toThrow(
        /must match fiscal period end year 2026/,
      );
      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
      expect(await db.preClosings.get(period.id, 2026)).toEqual({});
    });

    it("does not finalize or cancel pre-closing when its persisted marker is missing", async () => {
      const seed = seedWithPeriods("fp-missing-marker");
      seed.fiscalPeriods[0]!.record.phase = "pre_closing";
      const db = await ctx.makeSeededAdapter(seed);

      await expect(
        db.closings.run("fp-missing-marker", 2026, []),
      ).rejects.toThrow(/pre_closings marker is missing/);
      await expect(
        db.preClosings.cancel("fp-missing-marker", 2026),
      ).rejects.toThrow(/pre_closings marker is missing/);
      expect(
        (await db.fiscalPeriods.getById("fp-missing-marker"))?.phase,
      ).toBe("pre_closing");
      expect(await db.closings.get("fp-missing-marker", 2026)).toBeNull();
    });

    it("commits generated entries and final closing in one transition", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.entries.importMany("user-1", period.id, [
        closingGeneratedEntry("virtual:legacy", "legacy generated entry"),
      ]);
      await db.preClosings.run(period.id, 2026);

      const closed = await db.closings.run(period.id, 2026, [
        closingGeneratedEntry("virtual:final", "final generated entry"),
      ]);

      expect(closed.phase).toBe("post_closing");
      expect(await db.closings.get(period.id, 2026)).toEqual({});
      expect(
        (await db.entries.getAll(period.id)).map((entry) => entry.localId),
      ).toEqual(["virtual:final"]);
      await expect(
        db.entries.create(
          "user-1",
          period.id,
          closingGeneratedEntry("ordinary", "late entry"),
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
        db.fiscalPeriods.update(period.id, { name: "late rename" }),
      ).rejects.toThrow(/cannot update name from phase post_closing/);
    });

    it("rejects non-generated or invalid closing entries before replacing data", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.preClosings.run(period.id, 2026);

      await expect(
        db.closings.run(period.id, 2026, [
          closingGeneratedEntry("ordinary", "not generated"),
        ]),
      ).rejects.toThrow(/reserved generated prefix/);

      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
      expect(await db.closings.get(period.id, 2026)).toBeNull();
    });

    it("rejects oversized generated closing batches before persistence", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.preClosings.run(period.id, 2026);
      const entry = closingGeneratedEntry("virtual:limit", "limit");

      await expect(
        db.closings.run(
          period.id,
          2026,
          Array(MAX_ENTRY_IMPORT_ITEMS + 1).fill(entry),
        ),
      ).rejects.toThrow(/Closing entries exceed the 10,000 item limit/);

      const manyLines = Array(MAX_ENTRY_LINES).fill(testEntryLine);
      await expect(
        db.closings.run(
          period.id,
          2026,
          Array(MAX_ENTRY_IMPORT_LINES / MAX_ENTRY_LINES + 1).fill({
            ...entry,
            lines: manyLines,
          }),
        ),
      ).rejects.toThrow(/Closing entries exceed the 100,000 line limit/);
      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
      expect(await db.closings.get(period.id, 2026)).toBeNull();
    });

    it("removes legacy generated entries when pre-closing is cancelled", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.entries.importMany("user-1", period.id, [
        closingGeneratedEntry("virtual:legacy", "legacy generated entry"),
      ]);
      await db.preClosings.run(period.id, 2026);

      const reopened = await db.preClosings.cancel(period.id, 2026);

      expect(reopened.phase).toBe("journalizing");
      expect(await db.preClosings.get(period.id, 2026)).toBeNull();
      expect(await db.entries.getAll(period.id)).toEqual([]);
    });

    it("rolls back generated entry replacement when final closing fails", async () => {
      const db = await makeDb();
      const period = await createTestFiscalPeriod(db);
      await db.entries.importMany("user-1", period.id, [
        closingGeneratedEntry("virtual:legacy", "legacy generated entry"),
      ]);
      await db.preClosings.run(period.id, 2026);
      const duplicate = closingGeneratedEntry(
        "virtual:duplicate",
        "duplicate generated entry",
      );

      await expect(
        db.closings.run(period.id, 2026, [duplicate, duplicate]),
      ).rejects.toThrow(/duplicate localIds/);

      expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
        "pre_closing",
      );
      expect(await db.closings.get(period.id, 2026)).toBeNull();
      expect(
        (await db.entries.getAll(period.id)).map((entry) => entry.localId),
      ).toEqual(["virtual:legacy"]);
    });

    it("loads stable seed records", async () => {
      const seed: DbSnapshot = {
        fiscalPeriods: [
          {
            userId: "user-1",
            record: {
              id: "fp-seed",
              userId: "user-1",
              name: "Seed",
              startDate: "2026-01-01",
              endDate: "2026-12-31",
              phase: "pre_opening",
              archiveStatus: "active",
              settingsCompleted: false,
              openingBalancesCompleted: false,
              documentsReceivedCompleted: false,
              opening: null,
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          },
        ],
        entries: [],
        fixedAssets: [],
        preClosings: [{ fiscalPeriodId: "fp-seed", year: 2026 }],
        closings: [],
      };
      const db = await ctx.makeSeededAdapter(seed);

      expect(
        (await db.fiscalPeriods.getAllByUser("user-1")).map((fp) => fp.id),
      ).toEqual(["fp-seed"]);
      expect(await db.preClosings.get("fp-seed", 2026)).toEqual({});
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

    it("isolates closing rows by fiscal period and year", async () => {
      const seed = seedWithPeriods("fp-1", "fp-2");
      seed.preClosings = [{ fiscalPeriodId: "fp-1", year: 2026 }];
      seed.closings = [
        { fiscalPeriodId: "fp-1", year: 2027 },
        { fiscalPeriodId: "fp-2", year: 2026 },
      ];
      const db = await ctx.makeSeededAdapter(seed);

      expect(await db.preClosings.get("fp-1", 2026)).toEqual({});
      expect(await db.closings.get("fp-1", 2027)).toEqual({});
      expect(await db.closings.get("fp-2", 2026)).toEqual({});
    });
  });
}
