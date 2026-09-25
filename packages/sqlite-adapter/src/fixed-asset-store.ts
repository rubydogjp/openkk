import {
  applyPatch,
  assertFixedAssetMatchesRules,
  FIXED_ASSET_PATCH_KEYS,
  serverNotFoundError,
} from "@rubydogjp/openkk-server-domain";

import type {
  FixedAssetDbRecord,
  FixedAssetsDb,
} from "@rubydogjp/openkk-server-ports";
import {
  assertDbFiscalPeriodAllows,
  assertDbOwnedFiscalPeriodAllows,
} from "./fiscal-period-guard.js";
import {
  msToIso,
  parseFiscalPeriodDbData,
  parseFixedAssetDbData,
  serializeFixedAssetDbData,
} from "./persistence-codec.js";
import { newId, nowMs } from "./runtime.js";
import type { SqlDb } from "./sql-db.js";
import { runInTransaction } from "./transaction.js";

export function createFixedAssetsDb(db: SqlDb): FixedAssetsDb {
  return {
    async getAll(fiscalPeriodId) {
      const rows = (await db.exec({
        sql: `SELECT fa.data, fp.user_id, fa.created_at, fa.updated_at, fp.data
          FROM fixed_assets fa
          JOIN fiscal_periods fp ON fp.id = fa.fiscal_period_id
          WHERE fa.fiscal_period_id = ? ORDER BY fa.created_at ASC, fa.id ASC`,
        bind: [fiscalPeriodId],
        returnValue: "resultRows",
        rowMode: "array",
      })) as Array<[string, string, number, number, string]>;
      const firstRow = rows[0];
      if (firstRow == null) return [];
      const period = parseFiscalPeriodDbData(firstRow[4]);
      return rows.map(([data, userId, createdAt, updatedAt]) => {
        const asset: FixedAssetDbRecord = {
          ...parseFixedAssetDbData(data),
          userId,
          createdAt: msToIso(createdAt),
          updatedAt: msToIso(updatedAt),
        };
        assertFixedAssetMatchesRules(asset, period);
        return asset;
      });
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
        ...parseFixedAssetDbData(row[0]),
        userId: row[1],
        createdAt: msToIso(row[2]),
        updatedAt: msToIso(row[3]),
      };
      assertFixedAssetMatchesRules(asset, parseFiscalPeriodDbData(row[4]));
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
        disposalDate: null,
        disposalPrice: null,
        bookAccountId: input.bookAccountId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runInTransaction(db, async () => {
        const period = await assertDbOwnedFiscalPeriodAllows(
          db,
          userId,
          fiscalPeriodId,
          ["pre_opening", "journalizing"],
          "create fixed asset",
        );
        assertFixedAssetMatchesRules(record, period);
        await db.exec({
          sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
          bind: [
            id,
            fiscalPeriodId,
            serializeFixedAssetDbData(record),
            now,
            now,
          ],
        });
      });
      return record;
    },
    async patch(id, patch) {
      return runInTransaction(db, async () => {
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
          ...parseFixedAssetDbData(row[0]),
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
        const updated = applyPatch(existing, patch, FIXED_ASSET_PATCH_KEYS);
        assertFixedAssetMatchesRules(updated, period);
        await db.exec({
          sql: `UPDATE fixed_assets SET data = ?, updated_at = ? WHERE id = ?`,
          bind: [serializeFixedAssetDbData(updated), now, id],
        });
        return updated;
      });
    },
    async remove(id) {
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
