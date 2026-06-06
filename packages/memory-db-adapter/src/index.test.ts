import { describe, expect, it } from "vitest";

import { createMemoryDbAdapter, type MemoryDbSnapshot } from "./index";

function makeDb() {
  return createMemoryDbAdapter();
}

const testEntryLine = {
  side: "debit" as const,
  bookAccountId: "acct_cash",
  amount: 1000,
  partnerName: "",
  taxCategoryName: "tax-0",
  businessCategoryName: "",
};

describe("createMemoryDbAdapter / fiscalPeriods", () => {
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

    expect((await db.fiscalPeriods.getAllByUser("user-A")).map((r) => r.id))
      .toEqual([a.id]);
    expect((await db.fiscalPeriods.getAllByUser("user-B")).map((r) => r.name))
      .toEqual(["B1"]);
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
        { id: "balance-1", accountId: "acct_cash", amount: 1000 },
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
              taxCategoryName: "tax-0",
              businessCategoryName: "Business",
            },
          ],
        },
      ],
    };

    const updated = await db.fiscalPeriods.update(period.id, { opening });

    expect(updated.opening).toEqual(opening);
    expect((await db.fiscalPeriods.getById(period.id))?.opening).toEqual(opening);
    expect((await db.fiscalPeriods.getAllByUser("user-1"))[0]?.opening)
      .toEqual(opening);
  });

  it("rolls back the fiscal period when normalized opening replacement fails", async () => {
    const db = await makeDb();
    const period = await createTestFiscalPeriod(db);
    const invalidOpening = {
      ...period.opening!,
      openingBalanceLines: [
        { id: "balance-1", accountId: "acct_cash", amount: 1000 },
        { id: "balance-2", accountId: "acct_cash", amount: 2000 },
      ],
      openingJournals: [],
    };

    await expect(
      db.fiscalPeriods.update(period.id, {
        name: "must be rolled back",
        opening: invalidOpening,
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    expect(await db.fiscalPeriods.getById(period.id)).toEqual(period);
  });

  it("update throws when record not found", async () => {
    const db = await makeDb();
    await expect(
      db.fiscalPeriods.update("nonexistent", { name: "x" }),
    ).rejects.toThrow(/fiscal period not found/);
  });

  it.each(["pre_opening", "journalizing", "pre_closing", "post_closing"] as const)(
    "archives without changing the %s phase",
    async (phase) => {
      const sqlPhasePeriod = {
        ...seedWithPeriods("fp-archive").fiscalPeriods[0]!.record,
        phase,
      };
      const phaseDb = await createMemoryDbAdapter({
        fiscalPeriods: [{ userId: "user-1", record: sqlPhasePeriod }],
        entries: [],
        fixedAssets: [],
        preClosings: [],
        closings: [],
      });

      const archived = await phaseDb.fiscalPeriods.archive("fp-archive");

      expect(archived.phase).toBe(phase);
      expect(archived.archiveStatus).toBe("archived");
    },
  );

  it("deletes child entries, fixed assets, and closings with the fiscal period", async () => {
    const db = await makeDb();
    const period = await db.fiscalPeriods.create("user-1", {
      name: "FY2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await db.entries.create("user-1", period.id, {
      date: "2026-04-01",
      description: "entry",
      businessRate: 1,
      lines: [testEntryLine],
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
    await db.fiscalPeriods.update(period.id, { settingsCompleted: true });
    await db.preClosings.run(period.id, 2026);

    await db.fiscalPeriods.delete(period.id);

    expect(await db.fiscalPeriods.getById(period.id)).toBeNull();
    expect(await db.entries.getAll(period.id)).toEqual([]);
    expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([]);
    expect(await db.preClosings.get(period.id, 2026)).toBeNull();
    expect(await db.closings.get(period.id, 2026)).toBeNull();
  });

  it("imports archived fiscal periods with child records in one operation", async () => {
    const db = await makeDb();
    const imported = await db.fiscalPeriods.importArchived("user-1", {
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
          lines: [testEntryLine],
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
    });

    expect(imported.archiveStatus).toBe("active");
    expect(imported.phase).toBe("post_closing");
    expect(await db.fiscalPeriods.getAllByUser("user-1")).toEqual([imported]);
    expect(await db.entries.getAll(imported.id)).toHaveLength(1);
    expect((await db.fixedAssets.getAllByFiscalPeriod(imported.id))[0]).toMatchObject({
      name: "Imported Camera",
      status: "sold",
      disposalDate: "2026-12-01",
    });
    expect(await db.preClosings.get(imported.id, 2026)).toEqual({});
    expect(await db.closings.get(imported.id, 2026)).toEqual({});
  });
});

describe("createMemoryDbAdapter / entries", () => {
  it("rejects an entry whose fiscal period does not exist", async () => {
    const db = await makeDb();
    await expect(
      db.entries.create("user-1", "missing", {
        date: "2026-04-01",
        description: "orphan",
        businessRate: 1,
        lines: [testEntryLine],
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("creates, filters, updates, and deletes entries", async () => {
    const db = await makeDb();
    const firstPeriod = await createTestFiscalPeriod(db, "user-1", "First");
    const secondPeriod = await createTestFiscalPeriod(db, "user-1", "Second");
    const original = await db.entries.create("user-1", firstPeriod.id, {
      date: "2026-04-15",
      description: "before",
      localId: "local-1",
      businessRate: 1,
      lines: [testEntryLine],
    });
    await db.entries.create("user-1", secondPeriod.id, {
      date: "2026-04-16",
      description: "other fp",
      businessRate: 1,
      lines: [testEntryLine],
    });

    expect(original.id).toMatch(/^entry_/);
    expect((await db.entries.getAll(firstPeriod.id)).map((entry) => entry.id)).toEqual([
      original.id,
    ]);

    const updated = await db.entries.update(original.id, {
      date: "2026-05-01",
      description: "after",
      businessRate: 0.5,
      lines: [{ ...testEntryLine, amount: 2000 }],
    });
    expect(updated.id).toBe(original.id);
    expect(updated.description).toBe("after");
    expect(updated.businessRate).toBe(0.5);

    await db.entries.delete(original.id);
    expect(await db.entries.getById(original.id)).toBeNull();
  });

  it("importMany creates entries in input order", async () => {
    const db = await makeDb();
    const period = await createTestFiscalPeriod(db);
    const created = await db.entries.importMany("user-1", period.id, [
      {
        date: "2026-04-01",
        description: "first",
        businessRate: 1,
        lines: [testEntryLine],
      },
      {
        date: "2026-04-02",
        description: "second",
        businessRate: 1,
        lines: [testEntryLine],
      },
    ]);

    expect(created.map((entry) => entry.description)).toEqual([
      "first",
      "second",
    ]);
  });

  it("importMany is idempotent on localId across calls and within a batch", async () => {
    const db = await makeDb();
    const period = await createTestFiscalPeriod(db);
    const first = await db.entries.importMany("user-1", period.id, [
      { date: "2026-04-01", description: "a", localId: "L1", businessRate: 1, lines: [testEntryLine] },
      { date: "2026-04-02", description: "b", localId: "L2", businessRate: 1, lines: [testEntryLine] },
    ]);
    expect(first).toHaveLength(2);

    // Re-import L1 (existing) + L3 (new) + duplicate L3 within the batch.
    const second = await db.entries.importMany("user-1", period.id, [
      { date: "2026-04-01", description: "a-again", localId: "L1", businessRate: 1, lines: [testEntryLine] },
      { date: "2026-04-03", description: "c", localId: "L3", businessRate: 1, lines: [testEntryLine] },
      { date: "2026-04-03", description: "c-dup", localId: "L3", businessRate: 1, lines: [testEntryLine] },
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
      lines: [testEntryLine],
    };
    await db.entries.create("user-1", period.id, input);
    await expect(db.entries.create("user-1", period.id, input)).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("importMany always inserts entries without a localId", async () => {
    const db = await makeDb();
    const period = await createTestFiscalPeriod(db);
    const created = await db.entries.importMany("user-1", period.id, [
      { date: "2026-04-01", description: "x", businessRate: 1, lines: [testEntryLine] },
      { date: "2026-04-01", description: "y", businessRate: 1, lines: [testEntryLine] },
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
      lines: [testEntryLine],
    }));

    const created = await db.entries.importMany("user-1", period.id, inputs);

    expect(created).toHaveLength(501);
    expect(created.map(({ description }) => description)).toEqual(
      inputs.map(({ description }) => description),
    );
  });
});

describe("createMemoryDbAdapter / fixedAssets", () => {
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
    expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([asset]);

    const updated = await db.fixedAssets.update(asset.id, {
      businessRate: 0.7,
      status: "disposed",
      disposalDate: "2026-12-31",
      disposalPrice: 20000,
    });
    expect(updated).toMatchObject({
      businessRate: 0.7,
      status: "disposed",
      disposalDate: "2026-12-31",
      disposalPrice: 20000,
      name: "Camera",
    });

    await db.fixedAssets.delete(asset.id);
    expect(await db.fixedAssets.getAllByFiscalPeriod(period.id)).toEqual([]);
  });
});

describe("createMemoryDbAdapter / seed and closings", () => {
  it("rejects a closing whose fiscal period does not exist", async () => {
    const db = await makeDb();
    await expect(db.preClosings.run("missing", 2026)).rejects.toThrow(
      /fiscal period not found/,
    );
  });

  it("loads stable seed records", async () => {
    const seed: MemoryDbSnapshot = {
      fiscalPeriods: [
        {
          userId: "user-1",
          record: {
            id: "fp-seed",
            name: "Seed",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            phase: "pre_opening",
            archiveStatus: "active",
            settingsCompleted: false,
            openingBalancesCompleted: false,
            documentsReceivedCompleted: false,
            opening: null,
          },
        },
      ],
      entries: [],
      fixedAssets: [],
      preClosings: [{ fiscalPeriodId: "fp-seed", year: 2026 }],
      closings: [],
    };
    const db = await createMemoryDbAdapter(seed);

    expect((await db.fiscalPeriods.getAllByUser("user-1")).map((fp) => fp.id))
      .toEqual(["fp-seed"]);
    expect(await db.preClosings.get("fp-seed", 2026)).toEqual({});
  });

  it("isolates closing rows by fiscal period and year", async () => {
    const seed = seedWithPeriods("fp-1", "fp-2");
    seed.preClosings = [{ fiscalPeriodId: "fp-1", year: 2026 }];
    seed.closings = [
      { fiscalPeriodId: "fp-1", year: 2027 },
      { fiscalPeriodId: "fp-2", year: 2026 },
    ];
    const db = await createMemoryDbAdapter(seed);

    expect(await db.preClosings.get("fp-1", 2026)).toEqual({});
    expect(await db.closings.get("fp-1", 2027)).toEqual({});
    expect(await db.closings.get("fp-2", 2026)).toEqual({});
  });
});

function seedWithPeriods(...ids: string[]): MemoryDbSnapshot {
  return {
    fiscalPeriods: ids.map((id) => ({
      userId: "user-1",
      record: {
        id,
        name: id,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        phase: "journalizing",
        archiveStatus: "active",
        settingsCompleted: true,
        openingBalancesCompleted: true,
        documentsReceivedCompleted: false,
        opening: null,
      },
    })),
    entries: [],
    fixedAssets: [],
    preClosings: [],
    closings: [],
  };
}

async function createTestFiscalPeriod(
  db: Awaited<ReturnType<typeof createMemoryDbAdapter>>,
  userId = "user-1",
  name = "Test period",
) {
  return db.fiscalPeriods.create(userId, {
    name,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
}
