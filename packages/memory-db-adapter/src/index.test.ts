import { describe, expect, it } from "vitest";

import { createMemoryDbAdapter, type MemoryDbSnapshot } from "./index";

function makeDb() {
  return createMemoryDbAdapter();
}

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
    expect(created.stage).toBe("pre_opening");
    expect(created.settingsCompleted).toBe(false);
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

  it("update throws when record not found", async () => {
    const db = await makeDb();
    await expect(
      db.fiscalPeriods.update("nonexistent", { name: "x" }),
    ).rejects.toThrow(/fiscal period not found/);
  });
});

describe("createMemoryDbAdapter / entries", () => {
  const sampleLine = {
    side: "debit" as const,
    bookAccountId: "acc-cash",
    amount: 1000,
    partnerName: "",
    taxCategoryName: "tax-0",
    businessCategoryName: "",
  };

  it("creates, filters, updates, and deletes entries", async () => {
    const db = await makeDb();
    const original = await db.entries.create("user-1", "fp-1", {
      date: "2026-04-15",
      description: "before",
      localId: "local-1",
      businessRate: 1,
      lines: [sampleLine],
    });
    await db.entries.create("user-1", "fp-2", {
      date: "2026-04-16",
      description: "other fp",
      businessRate: 1,
      lines: [sampleLine],
    });

    expect(original.id).toMatch(/^entry_/);
    expect((await db.entries.getAll("fp-1")).map((entry) => entry.id)).toEqual([
      original.id,
    ]);
    expect(await db.entries.getByMonth("fp-1", "2026-04")).toHaveLength(1);

    const updated = await db.entries.update(original.id, {
      date: "2026-05-01",
      description: "after",
      businessRate: 0.5,
      lines: [{ ...sampleLine, amount: 2000 }],
    });
    expect(updated.id).toBe(original.id);
    expect(updated.description).toBe("after");
    expect(updated.businessRate).toBe(0.5);

    await db.entries.delete(original.id);
    expect(await db.entries.getById(original.id)).toBeNull();
  });

  it("importMany creates entries in input order", async () => {
    const db = await makeDb();
    const created = await db.entries.importMany("user-1", "fp-1", [
      {
        date: "2026-04-01",
        description: "first",
        businessRate: 1,
        lines: [sampleLine],
      },
      {
        date: "2026-04-02",
        description: "second",
        businessRate: 1,
        lines: [sampleLine],
      },
    ]);

    expect(created.map((entry) => entry.description)).toEqual([
      "first",
      "second",
    ]);
  });

  it("importMany is idempotent on localId across calls and within a batch", async () => {
    const db = await makeDb();
    const first = await db.entries.importMany("user-1", "fp-1", [
      { date: "2026-04-01", description: "a", localId: "L1", businessRate: 1, lines: [sampleLine] },
      { date: "2026-04-02", description: "b", localId: "L2", businessRate: 1, lines: [sampleLine] },
    ]);
    expect(first).toHaveLength(2);

    // Re-import L1 (existing) + L3 (new) + duplicate L3 within the batch.
    const second = await db.entries.importMany("user-1", "fp-1", [
      { date: "2026-04-01", description: "a-again", localId: "L1", businessRate: 1, lines: [sampleLine] },
      { date: "2026-04-03", description: "c", localId: "L3", businessRate: 1, lines: [sampleLine] },
      { date: "2026-04-03", description: "c-dup", localId: "L3", businessRate: 1, lines: [sampleLine] },
    ]);
    expect(second.map((entry) => entry.description)).toEqual(["c"]);
    expect(await db.entries.getAll("fp-1")).toHaveLength(3);
  });

  it("importMany always inserts entries without a localId", async () => {
    const db = await makeDb();
    const created = await db.entries.importMany("user-1", "fp-1", [
      { date: "2026-04-01", description: "x", businessRate: 1, lines: [sampleLine] },
      { date: "2026-04-01", description: "y", businessRate: 1, lines: [sampleLine] },
    ]);
    expect(created).toHaveLength(2);
  });
});

describe("createMemoryDbAdapter / fixedAssets", () => {
  it("create / getAllByFiscalPeriod / update / delete round-trip", async () => {
    const db = await makeDb();
    const asset = await db.fixedAssets.create("user-1", "fp-1", {
      name: "Camera",
      acquisitionDate: "2026-04-01",
      acquisitionCost: 100000,
      usefulLife: 3,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acc-tools",
    });

    expect(asset.id).toMatch(/^fa_/);
    expect(await db.fixedAssets.getAllByFiscalPeriod("fp-1")).toEqual([asset]);

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
    expect(await db.fixedAssets.getAllByFiscalPeriod("fp-1")).toEqual([]);
  });
});

describe("createMemoryDbAdapter / seed and closings", () => {
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
            stage: "pre_opening",
            settingsCompleted: false,
            openingBalancesCompleted: false,
            documentsReceivedCompleted: false,
            opening: null,
          },
        },
      ],
      entries: [],
      fixedAssets: [],
      closings: [{ fiscalPeriodId: "fp-seed", year: 2026, isProvisional: true }],
    };
    const db = await createMemoryDbAdapter(seed);

    expect((await db.fiscalPeriods.getAllByUser("user-1")).map((fp) => fp.id))
      .toEqual(["fp-seed"]);
    expect(await db.closings.get("fp-seed", 2026)).toEqual({
      isProvisional: true,
    });
  });

  it("isolates closing rows by fiscal period and year", async () => {
    const db = await makeDb();
    await db.closings.upsert("fp-1", 2026, true);
    await db.closings.upsert("fp-1", 2027, false);
    await db.closings.upsert("fp-2", 2026, false);

    expect(await db.closings.get("fp-1", 2026)).toEqual({ isProvisional: true });
    expect(await db.closings.get("fp-1", 2027)).toEqual({
      isProvisional: false,
    });
    expect(await db.closings.get("fp-2", 2026)).toEqual({
      isProvisional: false,
    });
  });
});
