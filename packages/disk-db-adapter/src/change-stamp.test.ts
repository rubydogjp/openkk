import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createDiskDbAdapter, type DiskDbAdapter } from "./index.js";

const openAdapters: DiskDbAdapter[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-change-stamp-"));
  tempDirs.push(dir);
  return path.join(dir, "book.openkk");
}

function readStamp(dbPath: string): number {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = database
      .prepare("SELECT value FROM openkk_meta WHERE key = 'last_changed_at'")
      .all() as Array<{ value: string }>;
    const row = rows[0] ?? null;
    if (row == null) throw new Error("the book has no change stamp");
    return Number(row.value);
  } finally {
    database.close();
  }
}

const entryInput = {
  date: "2026-06-01",
  description: "sale",
  localId: null,
  businessRate: 1,
  lines: [
    {
      side: "debit" as const,
      bookAccountId: "acct_cash",
      amount: 1000,
      partnerName: "",
      taxCategoryId: "tax_out_of_scope",
      businessCategoryId: "",
    },
    {
      side: "credit" as const,
      bookAccountId: "acct_sales",
      amount: 1000,
      partnerName: "",
      taxCategoryId: "tax_out_of_scope",
      businessCategoryId: "",
    },
  ],
};

const assetInput = {
  name: "PC",
  acquisitionDate: "2026-01-10",
  acquisitionCost: 200000,
  usefulLife: 4,
  depreciationMethod: "straight_line" as const,
  businessRate: 1,
  bookAccountId: "acct_equipment",
};

describe("change stamp", () => {
  it("starts with a stamp and keeps it while the book is only read", async () => {
    const dbPath = tempDbPath();
    const adapter = await createDiskDbAdapter(dbPath, null);
    openAdapters.push(adapter);
    const initial = readStamp(dbPath);

    await adapter.db.fiscalPeriods.getAll("user-1");
    await adapter.db.entries.getAll("missing");
    await adapter.db.masterData.getBookAccounts();

    expect(Number.isSafeInteger(initial)).toBe(true);
    expect(readStamp(dbPath)).toBe(initial);
  });

  it("moves the stamp forward on every operation that changes the book", async () => {
    const dbPath = tempDbPath();
    const adapter = await createDiskDbAdapter(dbPath, null);
    openAdapters.push(adapter);
    const { db } = adapter;
    let last = readStamp(dbPath);
    const steps: string[] = [];
    const changed = async <Result>(
      label: string,
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      const result = await operation();
      const stamp = readStamp(dbPath);
      if (stamp <= last) steps.push(label);
      last = stamp;
      return result;
    };

    const period = await changed("fiscalPeriods.create", () =>
      db.fiscalPeriods.create("user-1", {
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    );
    await changed("fiscalPeriods.patch", () =>
      db.fiscalPeriods.patch(period.id, { name: "2026年" }),
    );
    await changed("fiscalPeriods.start", () =>
      db.fiscalPeriods.start(period.id),
    );
    await changed("fiscalPeriods.patch opening", () =>
      db.fiscalPeriods.patch(period.id, { openingBalancesCompleted: true }),
    );
    const entry = await changed("entries.create", () =>
      db.entries.create("user-1", period.id, entryInput),
    );
    await changed("entries.update", () =>
      db.entries.update(entry.id, { ...entryInput, description: "sale 2" }),
    );
    await changed("entries.importMany", () =>
      db.entries.importMany("user-1", period.id, [
        { ...entryInput, localId: "import-1" },
      ]),
    );
    await changed("entries.remove", () => db.entries.remove(entry.id));
    const asset = await changed("fixedAssets.create", () =>
      db.fixedAssets.create("user-1", period.id, assetInput),
    );
    await changed("fixedAssets.patch", () =>
      db.fixedAssets.patch(asset.id, { name: "PC 2" }),
    );
    const removedAsset = await changed("fixedAssets.create again", () =>
      db.fixedAssets.create("user-1", period.id, assetInput),
    );
    await changed("fixedAssets.remove", () =>
      db.fixedAssets.remove(removedAsset.id),
    );
    await changed("preClosings.run", () => db.preClosings.run(period.id));
    await changed("preClosings.cancel", () => db.preClosings.cancel(period.id));
    await changed("preClosings.run again", () => db.preClosings.run(period.id));
    await changed("closings.run", () => db.closings.run(period.id, []));
    await changed("fiscalPeriods.patch documents", () =>
      db.fiscalPeriods.patch(period.id, { documentsReceivedCompleted: true }),
    );
    const next = await changed("fiscalPeriods.createNext", () =>
      db.fiscalPeriods.createNext("user-1", {
        sourceFiscalPeriodId: period.id,
        name: "2027年分",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        carryBalances: true,
        reversalEntryIds: [],
        carryFixedAssets: true,
      }),
    );
    await changed("fiscalPeriods.start next", () =>
      db.fiscalPeriods.start(next.id),
    );
    await changed("fiscalPeriods.applyCarryover", () =>
      db.fiscalPeriods.applyCarryover(next.id, {
        sourceFiscalPeriodId: period.id,
        carryBalances: true,
        reversalEntryIds: null,
        carryFixedAssets: false,
      }),
    );
    await changed("fiscalPeriods.applyCarryoverFromArchive", () =>
      db.fiscalPeriods.applyCarryoverFromArchive(next.id, {
        archive: {
          fiscalPeriod: {
            name: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            phase: "post_closing",
            openingBalancesCompleted: true,
            documentsReceivedCompleted: true,
            opening: { balanceLines: [], journals: [] },
          },
          entries: [],
          fixedAssets: [],
        },
        carryBalances: true,
        reversalEntryIndexes: null,
        carryFixedAssets: false,
      }),
    );
    await changed("fiscalPeriods.archive", () =>
      db.fiscalPeriods.archive(period.id),
    );
    await changed("fiscalPeriods.purgeArchivedData", () =>
      db.fiscalPeriods.purgeArchivedData(period.id),
    );
    await changed("fiscalPeriods.importArchived", () =>
      db.fiscalPeriods.importArchived("user-1", {
        fiscalPeriod: {
          name: "2025年分",
          startDate: "2025-01-01",
          endDate: "2025-12-31",
          phase: "post_closing",
          openingBalancesCompleted: true,
          documentsReceivedCompleted: true,
          opening: { balanceLines: [], journals: [] },
        },
        entries: [],
        fixedAssets: [],
      }),
    );
    await changed("fiscalPeriods.remove", () =>
      db.fiscalPeriods.remove(next.id),
    );

    expect(steps).toEqual([]);
  });

  it("keeps the stamp when an operation fails and rolls back", async () => {
    const dbPath = tempDbPath();
    const adapter = await createDiskDbAdapter(dbPath, null);
    openAdapters.push(adapter);
    const period = await adapter.db.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const before = readStamp(dbPath);

    await expect(
      adapter.db.fiscalPeriods.create("user-1", {
        name: "重なる期間",
        startDate: period.startDate,
        endDate: period.endDate,
      }),
    ).rejects.toThrow();

    expect(readStamp(dbPath)).toBe(before);
  });

  it("moves the stamp past a clock that runs behind the book", async () => {
    const dbPath = tempDbPath();
    const first = await createDiskDbAdapter(dbPath, null);
    first.close();
    const future = Date.now() + 60 * 60 * 1000;
    const database = new DatabaseSync(dbPath);
    database
      .prepare("UPDATE openkk_meta SET value = ? WHERE key = 'last_changed_at'")
      .run(String(future));
    database.close();
    const adapter = await createDiskDbAdapter(dbPath, null);
    openAdapters.push(adapter);

    await adapter.db.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });

    expect(readStamp(dbPath)).toBe(future + 1);
  });
});
