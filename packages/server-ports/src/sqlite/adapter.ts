import {
  CLOSING_GENERATED_LOCAL_ID_PREFIX,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  MAX_ENTRY_IMPORT_ITEMS,
  MAX_ENTRY_IMPORT_LINES,
  serverConflictError,
  serverNotFoundError,
  serverValidationError,
} from "@rubydogjp/openkk-server-domain";
import type {
  ClosingDbRecord,
  EntryDbRecord,
  EntryDbUpsertInput,
  FiscalPeriodArchiveDbImportInput,
  FiscalPeriodDbRecord,
  FixedAssetDbRecord,
  MasterBookAccountDbRecord,
  MasterBusinessCategoryDbRecord,
  MasterTaxCategoryDbRecord,
  PreClosingDbRecord,
} from "../persistence-types.js";
import type {
  ClosingsDb,
  EntriesDb,
  FiscalPeriodsDb,
  FixedAssetsDb,
  MasterDataDb,
  OpenkkDbPort,
  PreClosingsDb,
} from "../db-adapter.js";
import {
  msToIso,
  parseFiscalPeriodDbRecord,
  parseFixedAssetDbRecord,
  serializeFiscalPeriodDbRecord,
  serializeFixedAssetDbRecord,
} from "./persistence-codec.js";
import {
  defaultOpening,
  loadOpeningByFiscalPeriod,
  loadOpeningsByUser,
  replaceOpening,
} from "./opening-store.js";
import { serializeOpenkkDbPortOperations } from "./serialized-port.js";
import {
  assertDbArchiveImportSizeLimits,
  assertDbClosingGeneratedSizeLimits,
  assertDbClosingYear,
  assertDbEntryInput,
  assertDbFiscalPeriodPatchAllowed,
  assertDbFixedAssetRecord,
  assertDbImportedClosingState,
  assertDbOpeningForPeriod,
  assertDbPeriodOwnership,
  assertDbStoredEntryRecord,
} from "./record-validation.js";

export interface SqlDb {
  exec(
    arg:
      | string
      | {
          sql: string;
          bind?: unknown[];
          returnValue?: string;
          rowMode?: string;
        },
  ): Promise<unknown>;
}

export type DbSnapshot = {
  fiscalPeriods: Array<{ userId: string; record: FiscalPeriodDbRecord }>;
  entries: EntryDbRecord[];
  fixedAssets: FixedAssetDbRecord[];
  preClosings?: Array<{ fiscalPeriodId: string; year: number }>;
  closings: Array<{ fiscalPeriodId: string; year: number }>;
};

export async function createSqliteDbAdapter(
  db: SqlDb,
  seed?: DbSnapshot,
): Promise<OpenkkDbPort> {
  await db.exec("PRAGMA foreign_keys = ON");
  if (seed != null) {
    await seedStores(db, seed);
  }
  return serializeOpenkkDbPortOperations({
    fiscalPeriods: createFiscalPeriodsDb(db),
    entries: createEntriesDb(db),
    fixedAssets: createFixedAssetsDb(db),
    preClosings: createPreClosingsDb(db),
    closings: createClosingsDb(db),
    masterData: createMasterDataDb(),
  });
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

const MASTER_RECORD_TIMESTAMP = msToIso(0);
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
  const periods = new Map<string, FiscalPeriodDbRecord>();
  for (const item of seed.fiscalPeriods) {
    if (item.userId !== item.record.userId) {
      throw serverValidationError(
        `Seed fiscal period ownership is inconsistent: ${item.record.id}`,
      );
    }
    const seededOpening =
      item.record.opening == null
        ? defaultOpening(item.userId, item.record.id, now)
        : {
            ...item.record.opening,
            createdAt: msToIso(now),
            updatedAt: msToIso(now),
          };
    const record = {
      ...item.record,
      userId: item.userId,
      opening: seededOpening,
    };
    assertDbOpeningForPeriod(seededOpening, record);
    const serializedRecord = serializeFiscalPeriodDbRecord(record);
    await db.exec({
      sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [item.record.id, item.userId, serializedRecord, now, now],
    });
    await replaceOpening(db, seededOpening, now);
    periods.set(record.id, record);
  }
  for (const entry of seed.entries) {
    const period = periods.get(entry.fiscalPeriodId);
    if (period != null) assertDbStoredEntryRecord(entry, period);
    await db.exec({
      sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        entry.id,
        entry.fiscalPeriodId,
        entry.date,
        entry.localId,
        entry.description,
        entry.businessRate,
        now,
        now,
      ],
    });
    await insertEntryLines(db, entry);
  }
  for (const asset of seed.fixedAssets) {
    const period = periods.get(asset.fiscalPeriodId);
    if (period != null) {
      if (asset.userId !== period.userId) {
        throw serverValidationError(
          `Seed fixed asset ownership is inconsistent: ${asset.id}`,
        );
      }
      assertDbFixedAssetRecord(asset, period);
    }
    await db.exec({
      sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
      bind: [
        asset.id,
        asset.fiscalPeriodId,
        serializeFixedAssetDbRecord(asset),
        now,
        now,
      ],
    });
  }
  for (const preClosing of seed.preClosings ?? []) {
    await db.exec({
      sql: `INSERT OR REPLACE INTO pre_closings(fiscal_period_id, year) VALUES(?, ?)`,
      bind: [preClosing.fiscalPeriodId, preClosing.year],
    });
  }
  for (const closing of seed.closings) {
    await db.exec({
      sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year) VALUES(?, ?)`,
      bind: [closing.fiscalPeriodId, closing.year],
    });
  }
}

function createFiscalPeriodsDb(db: SqlDb): FiscalPeriodsDb {
  return {
    async getAllByUser(userId) {
      const rows = (await db.exec({
        sql: `SELECT data, created_at, updated_at FROM fiscal_periods WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
        bind: [userId],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, number, number]>;
      const openings = await loadOpeningsByUser(db, userId);
      return rows.map(([data, createdAt, updatedAt]) => {
        const record = parseFiscalPeriodDbRecord(data);
        const result: FiscalPeriodDbRecord = {
          ...record,
          userId,
          createdAt: msToIso(createdAt),
          updatedAt: msToIso(updatedAt),
          opening: requireOpening(openings.get(record.id), record.id),
        };
        assertDbOpeningForPeriod(result.opening!, result);
        return result;
      });
    },
    async getById(id) {
      const rows = (await db.exec({
        sql: `SELECT user_id, data, created_at, updated_at FROM fiscal_periods WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, string, number, number]>;
      const row = rows[0];
      if (row == null) return null;
      const record = parseFiscalPeriodDbRecord(row[1]);
      const result: FiscalPeriodDbRecord = {
        ...record,
        userId: row[0],
        createdAt: msToIso(row[2]),
        updatedAt: msToIso(row[3]),
        opening: requireOpening(await loadOpeningByFiscalPeriod(db, id), id),
      };
      assertDbOpeningForPeriod(result.opening!, result);
      return result;
    },
    async create(userId, input) {
      const id = newId("fp");
      const now = nowMs();
      const timestamp = msToIso(now);
      const record: FiscalPeriodDbRecord = {
        id,
        userId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        phase: "pre_opening",
        archiveStatus: "active",
        settingsCompleted: false,
        openingBalancesCompleted: false,
        documentsReceivedCompleted: false,
        opening: defaultOpening(userId, id, now),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      assertDbOpeningForPeriod(record.opening!, record);
      const serializedRecord = serializeFiscalPeriodDbRecord(record);
      await runInTransaction(db, async () => {
        await assertNoOverlappingActiveFiscalPeriod(db, {
          userId,
          startDate: record.startDate,
          endDate: record.endDate,
        });
        await db.exec({
          sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
          bind: [id, userId, serializedRecord, now, now],
        });
        await replaceOpening(db, record.opening!, now);
      });
      return record;
    },
    async importArchived(userId, input) {
      assertDbArchiveImportSizeLimits(input);
      const fiscalPeriodId = newId("fp");
      const now = nowMs();
      const timestamp = msToIso(now);
      const opening: FiscalPeriodDbRecord["opening"] =
        input.fiscalPeriod.opening == null
          ? defaultOpening(userId, fiscalPeriodId, now)
          : {
              ...input.fiscalPeriod.opening,
              id: `op-${fiscalPeriodId}`,
              userId,
              fiscalPeriodId,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
      const record: FiscalPeriodDbRecord = {
        id: fiscalPeriodId,
        userId,
        name: input.fiscalPeriod.name,
        startDate: input.fiscalPeriod.startDate,
        endDate: input.fiscalPeriod.endDate,
        phase: input.fiscalPeriod.phase,
        archiveStatus: "active",
        settingsCompleted: input.fiscalPeriod.settingsCompleted,
        openingBalancesCompleted: input.fiscalPeriod.openingBalancesCompleted,
        documentsReceivedCompleted:
          input.fiscalPeriod.documentsReceivedCompleted,
        opening,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      assertDbOpeningForPeriod(opening, record);
      assertDbImportedClosingState(
        record,
        input.preClosings ?? [],
        input.closings,
      );
      const serializedRecord = serializeFiscalPeriodDbRecord(record);
      await runInTransaction(db, async () => {
        await assertNoOverlappingActiveFiscalPeriod(db, {
          userId,
          startDate: record.startDate,
          endDate: record.endDate,
        });
        await db.exec({
          sql: `INSERT INTO fiscal_periods(id, user_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
          bind: [
            record.id,
            userId,
            serializedRecord,
            now,
            now,
          ],
        });
        await replaceOpening(db, opening, now);
        for (const inputEntry of input.entries) {
          assertDbEntryInput(inputEntry, record, "Archived entry");
          const id = newId("entry");
          const entry: EntryDbRecord = {
            id,
            userId,
            fiscalPeriodId,
            date: inputEntry.date,
            description: inputEntry.description,
            localId: inputEntry.localId ?? "",
            businessRate: inputEntry.businessRate,
            lines: inputEntry.lines.map((line) => ({
              ...line,
              id: newId("eline"),
            })),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await db.exec({
            sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
            bind: [
              id,
              fiscalPeriodId,
              entry.date,
              entry.localId,
              entry.description,
              entry.businessRate,
              now,
              now,
            ],
          });
          await insertEntryLines(db, entry);
        }
        for (const assetInput of input.fixedAssets) {
          const id = newId("fa");
          const asset: FixedAssetDbRecord = {
            id,
            userId,
            fiscalPeriodId,
            name: assetInput.createInput.name,
            acquisitionDate: assetInput.createInput.acquisitionDate,
            acquisitionCost: assetInput.createInput.acquisitionCost,
            usefulLife: assetInput.createInput.usefulLife,
            depreciationMethod: assetInput.createInput.depreciationMethod,
            businessRate: assetInput.createInput.businessRate,
            status: assetInput.patchInput?.status ?? "active",
            disposalDate: assetInput.patchInput?.disposalDate ?? "",
            disposalPrice: assetInput.patchInput?.disposalPrice ?? 0,
            bookAccountId: assetInput.createInput.bookAccountId,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          assertDbFixedAssetRecord(asset, record);
          await db.exec({
            sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
            bind: [
              id,
              fiscalPeriodId,
              serializeFixedAssetDbRecord(asset),
              now,
              now,
            ],
          });
        }
        for (const preClosing of input.preClosings ?? []) {
          await db.exec({
            sql: `INSERT OR REPLACE INTO pre_closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, preClosing.year],
          });
        }
        for (const closing of input.closings) {
          await db.exec({
            sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, closing.year],
          });
        }
      });
      return record;
    },
    async update(id, patch) {
      let updated: FiscalPeriodDbRecord | null = null;
      await runInTransaction(db, async () => {
        const rows = (await db.exec({
          sql: `SELECT user_id, data, created_at FROM fiscal_periods WHERE id = ?`,
          bind: [id],
          returnValue: "resultRows",
          rowMode: "array",
        })) as Array<[string, string, number]>;
        const row = rows[0];
        if (row == null)
          throw serverNotFoundError(`fiscal period not found: ${id}`);
        const now = nowMs();
        const timestamp = msToIso(now);
        const stored = parseFiscalPeriodDbRecord(row[1]);
        assertDbFiscalPeriodPatchAllowed(stored, patch);
        const existingOpening = requireOpening(
          await loadOpeningByFiscalPeriod(db, id),
          id,
        );
        const existing: FiscalPeriodDbRecord = {
          ...stored,
          userId: row[0],
          createdAt: msToIso(row[2]),
          updatedAt: timestamp,
          opening: existingOpening,
        };
        const normalizedOpening =
          patch.opening === undefined
            ? existing.opening
            : {
                ...patch.opening,
                userId: row[0],
                fiscalPeriodId: id,
                createdAt: existingOpening.createdAt,
                updatedAt: timestamp,
              };
        if (
          patch.opening !== undefined &&
          (patch.opening.id !== existingOpening.id ||
            patch.opening.userId !== row[0] ||
            patch.opening.fiscalPeriodId !== id)
        ) {
          throw serverValidationError(
            "Opening identity and ownership must match the fiscal period",
            "期首データの識別子と会計期間情報が一致しません",
          );
        }
        updated = {
          ...existing,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.startDate !== undefined
            ? { startDate: patch.startDate }
            : {}),
          ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
          ...(patch.settingsCompleted !== undefined
            ? { settingsCompleted: patch.settingsCompleted }
            : {}),
          ...(patch.openingBalancesCompleted !== undefined
            ? { openingBalancesCompleted: patch.openingBalancesCompleted }
            : {}),
          ...(patch.documentsReceivedCompleted !== undefined
            ? { documentsReceivedCompleted: patch.documentsReceivedCompleted }
            : {}),
          ...(patch.settingsCompleted === true &&
          existing.phase === "pre_opening"
            ? { phase: "journalizing" as const }
            : {}),
          opening: normalizedOpening,
        };
        assertDbOpeningForPeriod(normalizedOpening!, updated);
        const serializedRecord = serializeFiscalPeriodDbRecord(updated);
        if (patch.startDate !== undefined || patch.endDate !== undefined) {
          await assertNoOverlappingActiveFiscalPeriod(db, {
            userId: row[0],
            startDate: updated.startDate,
            endDate: updated.endDate,
            excludeFiscalPeriodId: id,
          });
        }
        await db.exec({
          sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializedRecord, now, id],
        });
        if (patch.opening !== undefined) {
          await replaceOpening(db, normalizedOpening!, now);
        }
      });
      return updated!;
    },
    async archive(id) {
      let updated: FiscalPeriodDbRecord | null = null;
      await runInTransaction(db, async () => {
        const rows = (await db.exec({
          sql: `SELECT user_id, data, created_at FROM fiscal_periods WHERE id = ?`,
          bind: [id],
          returnValue: "resultRows",
          rowMode: "array",
        })) as Array<[string, string, number]>;
        const row = rows[0];
        if (row == null)
          throw serverNotFoundError(`fiscal period not found: ${id}`);
        const now = nowMs();
        const current = parseFiscalPeriodDbRecord(row[1]);
        if (
          current.archiveStatus === "archived" ||
          current.phase !== "post_closing" ||
          !current.documentsReceivedCompleted
        ) {
          throw serverConflictError(
            `fiscal period cannot be archived from phase ${current.phase} (${current.archiveStatus})`,
            "本締めと書類受領が完了した会計期間のみ圧縮保存できます",
          );
        }
        updated = {
          ...current,
          userId: row[0],
          createdAt: msToIso(row[2]),
          updatedAt: msToIso(now),
          archiveStatus: "archived",
          archivedAt: current.archivedAt ?? msToIso(now),
        };
        await db.exec({
          sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializeFiscalPeriodDbRecord(updated), now, id],
        });
      });
      return {
        ...updated!,
        opening: requireOpening(await loadOpeningByFiscalPeriod(db, id), id),
      };
    },
    async purgeArchivedData(id) {
      const rows = (await db.exec({
        sql: `SELECT user_id, data, created_at FROM fiscal_periods WHERE id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, string, number]>;
      const row = rows[0];
      if (row == null)
        throw serverNotFoundError(`fiscal period not found: ${id}`);
      const current = parseFiscalPeriodDbRecord(row[1]);
      if (current.archiveStatus !== "archived") {
        throw serverConflictError(
          `fiscal period must be archived before purge: ${id}`,
          "圧縮保存後の会計期間のみ実データを削除できます",
        );
      }
      const now = nowMs();
      const updated: FiscalPeriodDbRecord = {
        ...current,
        userId: row[0],
        createdAt: msToIso(row[2]),
        updatedAt: msToIso(now),
        archiveDataAvailable: false,
        archivedAt: current.archivedAt ?? msToIso(now),
      };
      await runInTransaction(db, async () => {
        // 子データを削除（entry_lines / opening 配下は CASCADE で連鎖削除される）。
        await db.exec({
          sql: `DELETE FROM entries WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await db.exec({
          sql: `DELETE FROM fixed_assets WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await db.exec({
          sql: `DELETE FROM pre_closings WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        await db.exec({
          sql: `DELETE FROM closings WHERE fiscal_period_id = ?`,
          bind: [id],
        });
        // opening を空（既定）へリセットし、期首残高・再振替も消す。
        await replaceOpening(db, defaultOpening(row[0], id, now), now);
        await db.exec({
          sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializeFiscalPeriodDbRecord(updated), now, id],
        });
      });
      return {
        ...updated,
        opening: requireOpening(await loadOpeningByFiscalPeriod(db, id), id),
      };
    },
    async delete(id) {
      await db.exec({
        sql: `DELETE FROM fiscal_periods WHERE id = ?`,
        bind: [id],
      });
    },
  };
}

function requireOpening<Opening>(
  opening: Opening | null | undefined,
  fiscalPeriodId: string,
): Opening {
  if (opening == null) {
    throw new Error(`opening not found for fiscal period: ${fiscalPeriodId}`);
  }
  return opening;
}

async function assertNoOverlappingActiveFiscalPeriod(
  db: SqlDb,
  input: {
    userId: string;
    startDate: string;
    endDate: string;
    excludeFiscalPeriodId?: string;
  },
): Promise<void> {
  const rows = (await db.exec({
    sql: `SELECT data FROM fiscal_periods WHERE user_id = ?`,
    bind: [input.userId],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string]>;
  const overlap = rows
    .map(([data]) => parseFiscalPeriodDbRecord(data))
    .find(
      (period) =>
        period.id !== input.excludeFiscalPeriodId &&
        period.archiveStatus === "active" &&
        input.startDate <= period.endDate &&
        input.endDate >= period.startDate,
    );
  if (overlap != null) {
    throw serverConflictError(
      `fiscal period ${input.startDate} to ${input.endDate} overlaps active fiscal period ${overlap.id}`,
      "既存の会計期間と日付が重複しています",
    );
  }
}

async function assertDbFiscalPeriodAllows(
  db: SqlDb,
  fiscalPeriodId: string,
  allowedPhases: FiscalPeriodDbRecord["phase"][],
  operation: string,
): Promise<FiscalPeriodDbRecord | null> {
  const rows = (await db.exec({
    sql: `SELECT user_id, data FROM fiscal_periods WHERE id = ?`,
    bind: [fiscalPeriodId],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string]>;
  const row = rows[0];
  // 存在しない親は後続 INSERT の外部キー制約に判定させる。
  if (row == null) return null;
  const period = { ...parseFiscalPeriodDbRecord(row[1]), userId: row[0] };
  if (
    period.archiveStatus === "archived" ||
    !allowedPhases.includes(period.phase)
  ) {
    throw serverConflictError(
      `fiscal period cannot ${operation} from phase ${period.phase} (${period.archiveStatus})`,
      "会計期間の状態が変わったため、この操作を実行できません",
    );
  }
  return period;
}

function createEntriesDb(db: SqlDb): EntriesDb {
  async function loadAllByFiscalPeriod(fpId: string): Promise<EntryDbRecord[]> {
    return loadEntries(
      db,
      `WHERE e.fiscal_period_id = ? ORDER BY e.date ASC, e.created_at ASC, e.id ASC, l.position ASC`,
      [fpId],
    );
  }

  return {
    async getAll(fiscalPeriodId) {
      return loadAllByFiscalPeriod(fiscalPeriodId);
    },
    async getById(id) {
      return (
        (
          await loadEntries(db, `WHERE e.id = ? ORDER BY l.position ASC`, [id])
        )[0] ?? null
      );
    },
    async create(userId, fiscalPeriodId, input) {
      const id = newId("entry");
      const now = nowMs();
      const timestamp = msToIso(now);
      const record: EntryDbRecord = {
        id,
        userId,
        fiscalPeriodId,
        date: input.date,
        description: input.description,
        localId: input.localId ?? "",
        businessRate: input.businessRate,
        lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runInTransaction(db, async () => {
        const period = await assertDbFiscalPeriodAllows(
          db,
          fiscalPeriodId,
          ["journalizing"],
          "create entry",
        );
        assertDbPeriodOwnership(userId, period);
        assertDbEntryInput(input, period, "Entry");
        await db.exec({
          sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            id,
            fiscalPeriodId,
            record.date,
            record.localId,
            record.description,
            record.businessRate,
            now,
            now,
          ],
        });
        await insertEntryLines(db, record);
      });
      return record;
    },
    async update(id, input) {
      let updated: EntryDbRecord | null = null;
      await runInTransaction(db, async () => {
        const existing =
          (
            await loadEntries(db, `WHERE e.id = ? ORDER BY l.position ASC`, [
              id,
            ])
          )[0] ?? null;
        if (existing == null)
          throw serverNotFoundError(`entry not found: ${id}`);
        const period = await assertDbFiscalPeriodAllows(
          db,
          existing.fiscalPeriodId,
          ["journalizing"],
          "update entry",
        );
        assertDbEntryInput(input, period, "Entry");
        const now = nowMs();
        updated = {
          ...existing,
          date: input.date,
          description: input.description,
          localId: input.localId ?? existing.localId,
          businessRate: input.businessRate,
          lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
          updatedAt: msToIso(now),
        };
        await db.exec({
          sql: `UPDATE entries SET date = ?, local_id = ?, description = ?, business_rate = ?, updated_at = ? WHERE id = ?`,
          bind: [
            updated.date,
            updated.localId,
            updated.description,
            updated.businessRate,
            now,
            id,
          ],
        });
        await db.exec({
          sql: `DELETE FROM entry_lines WHERE entry_id = ?`,
          bind: [id],
        });
        await insertEntryLines(db, updated);
      });
      return updated!;
    },
    async delete(id) {
      await runInTransaction(db, async () => {
        const rows = (await db.exec({
          sql: `SELECT fiscal_period_id FROM entries WHERE id = ?`,
          bind: [id],
          returnValue: "resultRows",
          rowMode: "array",
        })) as Array<[string]>;
        if (rows[0] == null) return;
        await assertDbFiscalPeriodAllows(
          db,
          rows[0][0],
          ["journalizing"],
          "delete entry",
        );
        await db.exec({ sql: `DELETE FROM entries WHERE id = ?`, bind: [id] });
      });
    },
    async importMany(userId, fiscalPeriodId, inputs) {
      if (!Array.isArray(inputs)) {
        throw serverValidationError("Entry import input must be an array");
      }
      if (inputs.length > MAX_ENTRY_IMPORT_ITEMS) {
        throw serverValidationError(
          `Entry import exceeds the ${MAX_ENTRY_IMPORT_ITEMS} item limit`,
        );
      }
      let importLineCount = 0;
      for (const input of inputs) {
        if (input == null || !Array.isArray(input.lines)) {
          throw serverValidationError("Entry import lines must be an array");
        }
        importLineCount += input.lines.length;
        if (
          !Number.isSafeInteger(importLineCount) ||
          importLineCount > MAX_ENTRY_IMPORT_LINES
        ) {
          throw serverValidationError(
            `Entry import exceeds the ${MAX_ENTRY_IMPORT_LINES.toLocaleString("en-US")} line limit`,
          );
        }
      }
      const now = nowMs();
      const timestamp = msToIso(now);
      const candidates: EntryDbRecord[] = [];
      const seenLocalIds = new Set<string>();
      for (const input of inputs) {
        const localId = input.localId ?? "";
        if (localId !== "" && seenLocalIds.has(localId)) continue;
        if (localId !== "") seenLocalIds.add(localId);
        candidates.push({
          id: newId("entry"),
          userId,
          fiscalPeriodId,
          date: input.date,
          description: input.description,
          localId,
          businessRate: input.businessRate,
          lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      let insertedIds = new Set<string>();
      await runInTransaction(db, async () => {
        const period = await assertDbFiscalPeriodAllows(
          db,
          fiscalPeriodId,
          ["pre_opening", "journalizing"],
          "import entries",
        );
        assertDbPeriodOwnership(userId, period);
        inputs.forEach((input) => assertDbEntryInput(input, period, "Entry"));
        insertedIds = await insertImportedEntries(db, candidates, now);
        for (const entry of candidates) {
          if (insertedIds.has(entry.id)) await insertEntryLines(db, entry);
        }
      });
      return candidates.filter((record) => insertedIds.has(record.id));
    },
  };
}

type EntryRow = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  string | null,
  string | null,
  string | null,
  number | null,
  string | null,
  string | null,
  string | null,
  string,
];

async function loadEntries(
  db: SqlDb,
  whereAndOrder: string,
  bind: unknown[],
): Promise<EntryDbRecord[]> {
  const rows = (await db.exec({
    sql: `SELECT
      e.id, fp.user_id, e.fiscal_period_id, e.date, e.description, e.local_id,
      e.business_rate, e.created_at, e.updated_at,
      l.id, l.side, l.book_account_id, l.amount, l.partner_name,
      l.tax_category_id, l.business_category_id, fp.data
    FROM entries e
    JOIN fiscal_periods fp ON fp.id = e.fiscal_period_id
    LEFT JOIN entry_lines l ON l.entry_id = e.id
    ${whereAndOrder}`,
    bind,
    returnValue: "resultRows",
    rowMode: "array",
  })) as EntryRow[];
  const records = new Map<string, EntryDbRecord>();
  const periods = new Map<string, FiscalPeriodDbRecord>();
  for (const row of rows) {
    let record = records.get(row[0]);
    if (record == null) {
      record = {
        id: row[0],
        userId: row[1],
        fiscalPeriodId: row[2],
        date: row[3],
        description: row[4],
        localId: row[5],
        businessRate: row[6],
        createdAt: msToIso(row[7]),
        updatedAt: msToIso(row[8]),
        lines: [],
      };
      records.set(record.id, record);
      periods.set(record.id, {
        ...parseFiscalPeriodDbRecord(row[16]),
        userId: row[1],
      });
    }
    if (row[10] != null) {
      record.lines.push({
        id: row[9]!,
        side: row[10] as "debit" | "credit",
        bookAccountId: row[11]!,
        amount: row[12]!,
        partnerName: row[13]!,
        taxCategoryId: row[14]!,
        businessCategoryId: row[15]!,
      });
    }
  }
  for (const record of records.values()) {
    const period = periods.get(record.id);
    if (period == null) {
      throw new Error(`fiscal period not found for stored entry: ${record.id}`);
    }
    assertDbStoredEntryRecord(record, period);
  }
  return [...records.values()];
}

async function insertEntryLines(
  db: SqlDb,
  entry: EntryDbRecord,
): Promise<void> {
  for (const [position, line] of entry.lines.entries()) {
    await db.exec({
      sql: `INSERT INTO entry_lines(
        entry_id, id, side, book_account_id, amount, partner_name,
        tax_category_id, business_category_id, position
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        entry.id,
        line.id,
        line.side,
        line.bookAccountId,
        line.amount,
        line.partnerName,
        line.taxCategoryId,
        line.businessCategoryId,
        position,
      ],
    });
  }
}

const ENTRY_IMPORT_CHUNK_SIZE = 250;

async function insertImportedEntries(
  db: SqlDb,
  entries: EntryDbRecord[],
  now: number,
): Promise<Set<string>> {
  const insertedIds = new Set<string>();
  for (
    let offset = 0;
    offset < entries.length;
    offset += ENTRY_IMPORT_CHUNK_SIZE
  ) {
    const chunk = entries.slice(offset, offset + ENTRY_IMPORT_CHUNK_SIZE);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const bind = chunk.flatMap((entry) => [
      entry.id,
      entry.fiscalPeriodId,
      entry.date,
      entry.localId,
      entry.description,
      entry.businessRate,
      now,
      now,
    ]);
    const rows = (await db.exec({
      sql: `INSERT INTO entries(id, fiscal_period_id, date, local_id, description, business_rate, created_at, updated_at)
        VALUES ${placeholders}
        ON CONFLICT(fiscal_period_id, local_id) WHERE local_id <> '' DO NOTHING
        RETURNING id`,
      bind,
      returnValue: "resultRows",
      rowMode: "array",
    })) as Array<[string]>;
    rows.forEach(([id]) => insertedIds.add(id));
  }
  return insertedIds;
}

function createFixedAssetsDb(db: SqlDb): FixedAssetsDb {
  return {
    async getAllByFiscalPeriod(fiscalPeriodId) {
      const rows = (await db.exec({
        sql: `SELECT fa.data, fp.user_id, fa.created_at, fa.updated_at, fp.data
          FROM fixed_assets fa
          JOIN fiscal_periods fp ON fp.id = fa.fiscal_period_id
          WHERE fa.fiscal_period_id = ? ORDER BY fa.created_at ASC, fa.id ASC`,
        bind: [fiscalPeriodId],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, string, number, number, string]>;
      return rows.map(
        ([data, userId, createdAt, updatedAt, periodData]) => {
          const asset: FixedAssetDbRecord = {
            ...parseFixedAssetDbRecord(data),
            userId,
            createdAt: msToIso(createdAt),
            updatedAt: msToIso(updatedAt),
          };
          const period = {
            ...parseFiscalPeriodDbRecord(periodData),
            userId,
          };
          assertDbFixedAssetRecord(asset, period);
          return asset;
        },
      );
    },
    async getById(id) {
      const rows = (await db.exec({
        sql: `SELECT fa.data, fp.user_id, fa.created_at, fa.updated_at, fp.data
          FROM fixed_assets fa
          JOIN fiscal_periods fp ON fp.id = fa.fiscal_period_id
          WHERE fa.id = ?`,
        bind: [id],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, string, number, number, string]>;
      const row = rows[0];
      if (row == null) return null;
      const asset: FixedAssetDbRecord = {
        ...parseFixedAssetDbRecord(row[0]),
        userId: row[1],
        createdAt: msToIso(row[2]),
        updatedAt: msToIso(row[3]),
      };
      const period = {
        ...parseFiscalPeriodDbRecord(row[4]),
        userId: row[1],
      };
      assertDbFixedAssetRecord(asset, period);
      return asset;
    },
    async create(userId, fiscalPeriodId, input) {
      const id = newId("fa");
      const now = nowMs();
      const timestamp = msToIso(now);
      const record: FixedAssetDbRecord = {
        id,
        userId,
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
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runInTransaction(db, async () => {
        const period = await assertDbFiscalPeriodAllows(
          db,
          fiscalPeriodId,
          ["pre_opening", "journalizing"],
          "create fixed asset",
        );
        assertDbPeriodOwnership(userId, period);
        assertDbFixedAssetRecord(record, period);
        await db.exec({
          sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
          bind: [
            id,
            fiscalPeriodId,
            serializeFixedAssetDbRecord(record),
            now,
            now,
          ],
        });
      });
      return record;
    },
    async update(id, patch) {
      let updated: FixedAssetDbRecord | null = null;
      await runInTransaction(db, async () => {
        const rows = (await db.exec({
          sql: `SELECT fa.data, fp.user_id, fa.created_at
            FROM fixed_assets fa
            JOIN fiscal_periods fp ON fp.id = fa.fiscal_period_id
            WHERE fa.id = ?`,
          bind: [id],
          returnValue: "resultRows",
          rowMode: "array",
        })) as Array<[string, string, number]>;
        const row = rows[0];
        if (row == null)
          throw serverNotFoundError(`fixed asset not found: ${id}`);
        const now = nowMs();
        const existing: FixedAssetDbRecord = {
          ...parseFixedAssetDbRecord(row[0]),
          userId: row[1],
          createdAt: msToIso(row[2]),
          updatedAt: msToIso(now),
        };
        const period = await assertDbFiscalPeriodAllows(
          db,
          existing.fiscalPeriodId,
          ["journalizing"],
          "update fixed asset",
        );
        updated = {
          ...existing,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.acquisitionDate !== undefined
            ? { acquisitionDate: patch.acquisitionDate }
            : {}),
          ...(patch.acquisitionCost !== undefined
            ? { acquisitionCost: patch.acquisitionCost }
            : {}),
          ...(patch.usefulLife !== undefined
            ? { usefulLife: patch.usefulLife }
            : {}),
          ...(patch.depreciationMethod !== undefined
            ? { depreciationMethod: patch.depreciationMethod }
            : {}),
          ...(patch.businessRate !== undefined
            ? { businessRate: patch.businessRate }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.disposalDate !== undefined
            ? { disposalDate: patch.disposalDate }
            : {}),
          ...(patch.disposalPrice !== undefined
            ? { disposalPrice: patch.disposalPrice }
            : {}),
          ...(patch.bookAccountId !== undefined
            ? { bookAccountId: patch.bookAccountId }
            : {}),
        };
        assertDbFixedAssetRecord(updated, period);
        await db.exec({
          sql: `UPDATE fixed_assets SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializeFixedAssetDbRecord(updated), now, id],
        });
      });
      return updated!;
    },
    async delete(id) {
      await runInTransaction(db, async () => {
        const rows = (await db.exec({
          sql: `SELECT fiscal_period_id FROM fixed_assets WHERE id = ?`,
          bind: [id],
          returnValue: "resultRows",
          rowMode: "array",
        })) as Array<[string]>;
        if (rows[0] == null) return;
        await assertDbFiscalPeriodAllows(
          db,
          rows[0][0],
          ["journalizing"],
          "delete fixed asset",
        );
        await db.exec({
          sql: `DELETE FROM fixed_assets WHERE id = ?`,
          bind: [id],
        });
      });
    },
  };
}

function createPreClosingsDb(db: SqlDb): PreClosingsDb {
  return {
    async get(fiscalPeriodId, year) {
      const rows = (await db.exec({
        sql: `SELECT 1 FROM pre_closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[number]>;
      return rows[0] == null ? null : ({} satisfies PreClosingDbRecord);
    },
    async run(fiscalPeriodId, year) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "journalizing",
        "pre_closing",
        async (_userId, period) => {
          assertDbClosingYear(period, year);
          await db.exec({
            sql: `INSERT OR REPLACE INTO pre_closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, year],
          });
        },
      );
    },
    async cancel(fiscalPeriodId, year) {
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "journalizing",
        async (_userId, period) => {
          assertDbClosingYear(period, year);
          await assertDbClosingMarkerExists(
            db,
            "pre_closings",
            fiscalPeriodId,
            year,
          );
          await db.exec({
            sql: `DELETE FROM pre_closings WHERE fiscal_period_id = ? AND year = ?`,
            bind: [fiscalPeriodId, year],
          });
          await deleteClosingGeneratedEntries(db, fiscalPeriodId);
        },
      );
    },
  };
}

function createClosingsDb(db: SqlDb): ClosingsDb {
  return {
    async get(fiscalPeriodId, year) {
      const rows = (await db.exec({
        sql: `SELECT 1 FROM closings WHERE fiscal_period_id = ? AND year = ?`,
        bind: [fiscalPeriodId, year],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[number]>;
      return rows[0] == null ? null : ({} satisfies ClosingDbRecord);
    },
    async run(fiscalPeriodId, year, entries) {
      assertDbClosingGeneratedSizeLimits(entries);
      return transitionFiscalPeriod(
        db,
        fiscalPeriodId,
        "pre_closing",
        "post_closing",
        async (userId, period) => {
          assertDbClosingYear(period, year);
          await assertDbClosingMarkerExists(
            db,
            "pre_closings",
            fiscalPeriodId,
            year,
          );
          await replaceClosingGeneratedEntries(
            db,
            userId,
            fiscalPeriodId,
            entries,
            period,
          );
          await db.exec({
            sql: `INSERT OR REPLACE INTO closings(fiscal_period_id, year) VALUES(?, ?)`,
            bind: [fiscalPeriodId, year],
          });
        },
      );
    },
  };
}

async function deleteClosingGeneratedEntries(
  db: SqlDb,
  fiscalPeriodId: string,
): Promise<void> {
  await db.exec({
    sql: `DELETE FROM entries WHERE fiscal_period_id = ? AND local_id LIKE ?`,
    bind: [fiscalPeriodId, `${CLOSING_GENERATED_LOCAL_ID_PREFIX}%`],
  });
}

async function replaceClosingGeneratedEntries(
  db: SqlDb,
  userId: string,
  fiscalPeriodId: string,
  inputs: EntryDbUpsertInput[],
  period: FiscalPeriodDbRecord,
): Promise<void> {
  for (const input of inputs) {
    assertDbEntryInput(input, period, "Closing entry");
    if (
      typeof input.localId !== "string" ||
      !input.localId.startsWith(CLOSING_GENERATED_LOCAL_ID_PREFIX)
    ) {
      throw serverValidationError(
        "Closing entry localId must use the reserved generated prefix",
      );
    }
  }
  await deleteClosingGeneratedEntries(db, fiscalPeriodId);
  const now = nowMs();
  const timestamp = msToIso(now);
  const candidates: EntryDbRecord[] = inputs.map((input) => ({
    id: newId("entry"),
    userId,
    fiscalPeriodId,
    date: input.date,
    description: input.description,
    localId: input.localId ?? "",
    businessRate: input.businessRate,
    lines: input.lines.map((line) => ({ ...line, id: newId("eline") })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const insertedIds = await insertImportedEntries(db, candidates, now);
  if (insertedIds.size !== candidates.length) {
    throw serverConflictError(
      "closing generated entries contain duplicate localIds",
      "本締め用の自動仕訳が重複したため、本締めを中止しました",
    );
  }
  for (const entry of candidates) {
    await insertEntryLines(db, entry);
  }
}

async function assertDbClosingMarkerExists(
  db: SqlDb,
  table: "pre_closings" | "closings",
  fiscalPeriodId: string,
  year: number,
): Promise<void> {
  const rows = (await db.exec({
    sql: `SELECT 1 FROM ${table} WHERE fiscal_period_id = ? AND year = ?`,
    bind: [fiscalPeriodId, year],
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[number]>;
  if (rows[0] == null) {
    throw serverConflictError(
      `${table} marker is missing for fiscal period ${fiscalPeriodId} and year ${year}`,
      "締め状態の保存データが一致しないため、処理を実行できません",
    );
  }
}

async function transitionFiscalPeriod(
  db: SqlDb,
  fiscalPeriodId: string,
  expectedPhase: FiscalPeriodDbRecord["phase"],
  nextPhase: FiscalPeriodDbRecord["phase"],
  writeTransitionData: (
    userId: string,
    period: FiscalPeriodDbRecord,
  ) => Promise<void>,
): Promise<FiscalPeriodDbRecord> {
  let updated: FiscalPeriodDbRecord | null = null;
  await runInTransaction(db, async () => {
    const rows = (await db.exec({
      sql: `SELECT user_id, data, created_at FROM fiscal_periods WHERE id = ?`,
      bind: [fiscalPeriodId],
      returnValue: "resultRows",
      rowMode: "array",
    })) as Array<[string, string, number]>;
    const row = rows[0];
    if (row == null)
      throw serverNotFoundError(`fiscal period not found: ${fiscalPeriodId}`);
    const current = parseFiscalPeriodDbRecord(row[1]);
    if (current.archiveStatus === "archived") {
      throw serverConflictError(
        `archived fiscal period cannot transition: ${fiscalPeriodId}`,
        "圧縮保存済みの会計期間は変更できません",
      );
    }
    if (current.phase !== expectedPhase) {
      throw serverConflictError(
        `invalid fiscal period transition: ${current.phase} -> ${nextPhase}`,
        "会計期間の状態が変わったため、この操作を実行できません",
      );
    }
    const now = nowMs();
    updated = {
      ...current,
      userId: row[0],
      createdAt: msToIso(row[2]),
      updatedAt: msToIso(now),
      phase: nextPhase,
    };
    const opening = requireOpening(
      await loadOpeningByFiscalPeriod(db, fiscalPeriodId),
      fiscalPeriodId,
    );
    assertDbOpeningForPeriod(opening, updated);
    const serializedRecord = serializeFiscalPeriodDbRecord(updated);
    const currentWithOwnership = { ...current, userId: row[0] };
    await writeTransitionData(row[0], currentWithOwnership);
    await db.exec({
      sql: `UPDATE fiscal_periods SET data = ?, updated_at = ? WHERE id = ?`,
      bind: [serializedRecord, now, fiscalPeriodId],
    });
  });
  const opening = requireOpening(
    await loadOpeningByFiscalPeriod(db, fiscalPeriodId),
    fiscalPeriodId,
  );
  return { ...updated!, opening };
}

function createMasterDataDb(): MasterDataDb {
  return {
    async getAllBookAccounts() {
      return DEFAULT_BOOK_ACCOUNTS.map(
        (a): MasterBookAccountDbRecord => ({
          id: a.id,
          name: a.name,
          description: a.description,
          kana: a.kana,
          normalBalanceSide: a.normalBalanceSide,
          accountType: a.accountType,
          balanceSheetSection: a.balanceSheetSection,
          sortOrder: a.sortOrder,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
    async getAllTaxCategories() {
      return DEFAULT_TAX_CATEGORIES.map(
        (c): MasterTaxCategoryDbRecord => ({
          id: c.id,
          name: c.name,
          rate: c.rate,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
    async getAllBusinessCategories() {
      return DEFAULT_BUSINESS_CATEGORIES.map(
        (c): MasterBusinessCategoryDbRecord => ({
          id: c.id,
          name: c.name,
          createdAt: MASTER_RECORD_TIMESTAMP,
          updatedAt: MASTER_RECORD_TIMESTAMP,
        }),
      );
    },
  };
}
