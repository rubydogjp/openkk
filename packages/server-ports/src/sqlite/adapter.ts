import {
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
} from "@rubydogjp/openkk-server-domain";
import type {
  ClosingApiRecord,
  EntryApiRecord,
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
  MasterBookAccount,
  MasterBusinessCategory,
  MasterTaxCategory,
} from "../types";
import type {
  ClosingsDb,
  EntriesDb,
  FiscalPeriodsDb,
  FixedAssetsDb,
  MasterDataDb,
  OpenkkDbPort,
} from "../db-adapter";

/** Minimal async interface required by createSqliteDbAdapter. Adapters provide it
 * either by wrapping a same-thread SQLite Wasm DB or by proxying to a Web Worker. */
export interface SqlDb {
  exec(arg: string | { sql: string; bind?: unknown[]; returnValue?: string; rowMode?: string }): Promise<unknown>;
}

export type DbSnapshot = {
  fiscalPeriods: Array<{ userId: string; record: FiscalPeriodApiRecord }>;
  entries: EntryApiRecord[];
  fixedAssets: FixedAssetApiRecord[];
  closings: Array<{
    fiscalPeriodId: string;
    year: number;
    isProvisional: boolean;
  }>;
};

export async function createSqliteDbAdapter(
  db: SqlDb,
  seed?: DbSnapshot,
): Promise<OpenkkDbPort> {
  if (seed != null) {
    await seedStores(db, seed);
  }
  return {
    fiscalPeriods: createFiscalPeriodsDb(db),
    entries: createEntriesDb(db),
    fixedAssets: createFixedAssetsDb(db),
    closings: createClosingsDb(db),
    masterData: createMasterDataDb(),
  };
}

function newId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

function nowMs(): number {
  return Date.now();
}

/** Wrap a batch of writes in a single transaction so partial failures roll back
 * and OPFS commits once instead of per-statement. */
async function runInTransaction(
  db: SqlDb,
  fn: () => Promise<void>,
): Promise<void> {
  await db.exec("BEGIN");
  try {
    await fn();
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function seedStores(db: SqlDb, seed: DbSnapshot): Promise<void> {
  const now = nowMs();
  await runInTransaction(db, async () => {
    await seedStoresInner(db, seed, now);
  });
}

async function seedStoresInner(
  db: SqlDb,
  seed: DbSnapshot,
  now: number,
): Promise<void> {
  for (const item of seed.fiscalPeriods) {
    await db.exec({
      sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [item.record.id, item.userId, JSON.stringify(item.record), now, now],
    });
  }
  for (const entry of seed.entries) {
    await db.exec({
      sql: `INSERT INTO entries(id, fiscal_period_id, date, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`,
      bind: [entry.id, entry.fiscalPeriodId, entry.date, JSON.stringify(entry), now, now],
    });
  }
  for (const asset of seed.fixedAssets) {
    await db.exec({
      sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [asset.id, asset.fiscalPeriodId, JSON.stringify(asset), now, now],
    });
  }
  for (const closing of seed.closings) {
    await db.exec({
      sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year, is_provisional) VALUES(?, ?, ?)`,
      bind: [closing.fiscalPeriodId, closing.year, closing.isProvisional ? 1 : 0],
    });
  }
}

function createFiscalPeriodsDb(db: SqlDb): FiscalPeriodsDb {
  return {
    async getAllByUser(userId) {
      const rows = await db.exec({
        sql: `SELECT data FROM fiscal_periods WHERE user_id = ? ORDER BY created_at ASC`,
        bind: [userId],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      return rows.map((row) => JSON.parse(row[0]) as FiscalPeriodApiRecord);
    },
    async getById(id) {
      const rows = await db.exec({
        sql: `SELECT data FROM fiscal_periods WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      const row = rows[0];
      return row == null ? null : (JSON.parse(row[0]) as FiscalPeriodApiRecord);
    },
    async create(userId, input) {
      const id = newId("fp");
      const record: FiscalPeriodApiRecord = {
        id,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        stage: "pre_opening",
        settingsCompleted: false,
        openingBalancesCompleted: false,
        documentsReceivedCompleted: false,
        opening: null,
      };
      const now = nowMs();
      await db.exec({
        sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
        bind: [id, userId, JSON.stringify(record), now, now],
      });
      return record;
    },
    async update(id, patch) {
      const rows = await db.exec({
        sql: `SELECT user_id, data FROM fiscal_periods WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string, string]>;
      const row = rows[0];
      if (row == null) throw new Error(`fiscal period not found: ${id}`);
      const existing = JSON.parse(row[1]) as FiscalPeriodApiRecord;
      const updated: FiscalPeriodApiRecord = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
        ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
        ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
        ...(patch.settingsCompleted !== undefined ? { settingsCompleted: patch.settingsCompleted } : {}),
        ...(patch.openingBalancesCompleted !== undefined ? { openingBalancesCompleted: patch.openingBalancesCompleted } : {}),
        ...(patch.documentsReceivedCompleted !== undefined ? { documentsReceivedCompleted: patch.documentsReceivedCompleted } : {}),
        ...(patch.opening !== undefined ? { opening: patch.opening } : {}),
      };
      await db.exec({
        sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
        bind: [JSON.stringify(updated), nowMs(), id],
      });
      return updated;
    },
    async delete(id) {
      await db.exec({ sql: `DELETE FROM fiscal_periods WHERE id = ?`, bind: [id] });
    },
  };
}

function createEntriesDb(db: SqlDb): EntriesDb {
  async function loadAllByFiscalPeriod(fpId: string): Promise<EntryApiRecord[]> {
    const rows = await db.exec({
      sql: `SELECT data FROM entries WHERE fiscal_period_id = ? ORDER BY date ASC, created_at ASC`,
      bind: [fpId],
      returnValue: "resultRows",
      rowMode: "array",
    }) as Array<[string]>;
    return rows.map((row) => JSON.parse(row[0]) as EntryApiRecord);
  }

  return {
    async getAll(fiscalPeriodId) {
      return loadAllByFiscalPeriod(fiscalPeriodId);
    },
    async getByMonth(fiscalPeriodId, yearMonth) {
      const rows = await db.exec({
        sql: `SELECT data FROM entries WHERE fiscal_period_id = ? AND date LIKE ? ORDER BY date ASC, created_at ASC`,
        bind: [fiscalPeriodId, `${yearMonth}%`],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      return rows.map((row) => JSON.parse(row[0]) as EntryApiRecord);
    },
    async getById(id) {
      const rows = await db.exec({
        sql: `SELECT data FROM entries WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      const row = rows[0];
      return row == null ? null : (JSON.parse(row[0]) as EntryApiRecord);
    },
    async create(_userId, fiscalPeriodId, input) {
      const id = newId("entry");
      const record: EntryApiRecord = {
        id,
        fiscalPeriodId,
        date: input.date,
        description: input.description,
        localId: input.localId ?? "",
        businessRate: input.businessRate,
        lines: input.lines.map((line) => ({ ...line })),
      };
      const now = nowMs();
      await db.exec({
        sql: `INSERT INTO entries(id, fiscal_period_id, date, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`,
        bind: [id, fiscalPeriodId, record.date, JSON.stringify(record), now, now],
      });
      return record;
    },
    async update(id, input) {
      const rows = await db.exec({
        sql: `SELECT data FROM entries WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      const row = rows[0];
      if (row == null) throw new Error(`entry not found: ${id}`);
      const existing = JSON.parse(row[0]) as EntryApiRecord;
      const updated: EntryApiRecord = {
        ...existing,
        date: input.date,
        description: input.description,
        localId: input.localId ?? existing.localId,
        businessRate: input.businessRate,
        lines: input.lines.map((line) => ({ ...line })),
      };
      await db.exec({
        sql: `UPDATE entries SET date = ?, data = ?, updated_at = ? WHERE id = ?`,
        bind: [updated.date, JSON.stringify(updated), nowMs(), id],
      });
      return updated;
    },
    async delete(id) {
      await db.exec({ sql: `DELETE FROM entries WHERE id = ?`, bind: [id] });
    },
    async importMany(_userId, fiscalPeriodId, inputs) {
      const created: EntryApiRecord[] = [];
      await runInTransaction(db, async () => {
        // localId is the import source's stable key: an entry whose localId
        // already exists in this fiscal period is skipped, so re-importing the
        // same file is idempotent. Entries without a localId are always inserted.
        const existing = await loadAllByFiscalPeriod(fiscalPeriodId);
        const seenLocalIds = new Set(
          existing
            .map((entry) => entry.localId)
            .filter((localId) => localId !== ""),
        );
        for (const input of inputs) {
          const localId = input.localId ?? "";
          if (localId !== "" && seenLocalIds.has(localId)) continue;
          if (localId !== "") seenLocalIds.add(localId);
          const id = newId("entry");
          const record: EntryApiRecord = {
            id,
            fiscalPeriodId,
            date: input.date,
            description: input.description,
            localId,
            businessRate: input.businessRate,
            lines: input.lines.map((line) => ({ ...line })),
          };
          const now = nowMs();
          await db.exec({
            sql: `INSERT INTO entries(id, fiscal_period_id, date, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)`,
            bind: [id, fiscalPeriodId, record.date, JSON.stringify(record), now, now],
          });
          created.push(record);
        }
      });
      return created;
    },
  };
}

function createFixedAssetsDb(db: SqlDb): FixedAssetsDb {
  return {
    async getAllByFiscalPeriod(fiscalPeriodId) {
      const rows = await db.exec({
        sql: `SELECT data FROM fixed_assets WHERE fiscal_period_id = ? ORDER BY created_at ASC`,
        bind: [fiscalPeriodId],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      return rows.map((row) => JSON.parse(row[0]) as FixedAssetApiRecord);
    },
    async getById(id) {
      const rows = await db.exec({
        sql: `SELECT data FROM fixed_assets WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      const row = rows[0];
      return row == null ? null : (JSON.parse(row[0]) as FixedAssetApiRecord);
    },
    async create(_userId, fiscalPeriodId, input) {
      const id = newId("fa");
      const record: FixedAssetApiRecord = {
        id,
        fiscalPeriodId,
        name: input.name,
        acquisitionDate: input.acquisitionDate,
        acquisitionCost: input.acquisitionCost,
        usefulLife: input.usefulLife,
        depreciationMethod: input.depreciationMethod,
        businessRate: input.businessRate,
        status: "active",
        disposalDate: "",
        disposalPrice: 0,
        bookAccountId: input.bookAccountId,
      };
      const now = nowMs();
      await db.exec({
        sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
        bind: [id, fiscalPeriodId, JSON.stringify(record), now, now],
      });
      return record;
    },
    async update(id, patch) {
      const rows = await db.exec({
        sql: `SELECT data FROM fixed_assets WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[string]>;
      const row = rows[0];
      if (row == null) throw new Error(`fixed asset not found: ${id}`);
      const existing = JSON.parse(row[0]) as FixedAssetApiRecord;
      const updated: FixedAssetApiRecord = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.acquisitionDate !== undefined ? { acquisitionDate: patch.acquisitionDate } : {}),
        ...(patch.acquisitionCost !== undefined ? { acquisitionCost: patch.acquisitionCost } : {}),
        ...(patch.usefulLife !== undefined ? { usefulLife: patch.usefulLife } : {}),
        ...(patch.depreciationMethod !== undefined ? { depreciationMethod: patch.depreciationMethod } : {}),
        ...(patch.businessRate !== undefined ? { businessRate: patch.businessRate } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.disposalDate !== undefined ? { disposalDate: patch.disposalDate } : {}),
        ...(patch.disposalPrice !== undefined ? { disposalPrice: patch.disposalPrice } : {}),
        ...(patch.bookAccountId !== undefined ? { bookAccountId: patch.bookAccountId } : {}),
      };
      await db.exec({
        sql: `UPDATE fixed_assets SET data = ?, updated_at = ? WHERE id = ?`,
        bind: [JSON.stringify(updated), nowMs(), id],
      });
      return updated;
    },
    async delete(id) {
      await db.exec({ sql: `DELETE FROM fixed_assets WHERE id = ?`, bind: [id] });
    },
  };
}

function createClosingsDb(db: SqlDb): ClosingsDb {
  return {
    async get(fiscalPeriodId, year) {
      const rows = await db.exec({
        sql: `SELECT is_provisional FROM closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
        returnValue: "resultRows",
        rowMode: "array",
      }) as Array<[number]>;
      const row = rows[0];
      if (row == null) return null;
      return { isProvisional: row[0] === 1 } satisfies ClosingApiRecord;
    },
    async upsert(fiscalPeriodId, year, isProvisional) {
      await db.exec({
        sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year, is_provisional) VALUES(?, ?, ?)`,
        bind: [fiscalPeriodId, year, isProvisional ? 1 : 0],
      });
    },
    async delete(fiscalPeriodId, year) {
      await db.exec({
        sql: `DELETE FROM closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
      });
    },
  };
}

function createMasterDataDb(): MasterDataDb {
  return {
    async getAllBookAccounts() {
      return DEFAULT_BOOK_ACCOUNTS.map(
        (a): MasterBookAccount => ({
          id: a.id,
          name: a.name,
          accountType: a.accountType,
        }),
      );
    },
    async getAllTaxCategories() {
      return DEFAULT_TAX_CATEGORIES.map(
        (c): MasterTaxCategory => ({ id: c.id, name: c.name }),
      );
    },
    async getAllBusinessCategories() {
      return DEFAULT_BUSINESS_CATEGORIES.map(
        (c): MasterBusinessCategory => ({ id: c.id, name: c.name }),
      );
    },
  };
}
