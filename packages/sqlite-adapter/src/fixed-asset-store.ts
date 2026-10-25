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
      return loadFixedAssets(
        db,
        `WHERE fa.fiscal_period_id = ? ORDER BY fa.created_at ASC, fa.id ASC`,
        [fiscalPeriodId],
      );
    },
    async getById(id) {
      return (await loadFixedAssets(db, `WHERE fa.id = ?`, [id]))[0] ?? null;
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
        await insertFixedAsset(db, record, now);
      });
      return record;
    },
    async patch(id, patch) {
      return runInTransaction(db, async () => {
        const existing =
          (await loadFixedAssets(db, `WHERE fa.id = ?`, [id]))[0] ?? null;
        if (existing == null) {
          throw serverNotFoundError(`fixed asset not found: ${id}`);
        }
        const period = await assertDbFiscalPeriodAllows(
          db,
          existing.fiscalPeriodId,
          ["journalizing"],
          "update fixed asset",
        );
        const now = nowMs();
        const updated = applyPatch(
          { ...existing, updatedAt: msToIso(now) },
          patch,
          FIXED_ASSET_PATCH_KEYS,
        );
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

async function loadFixedAssets(
  db: SqlDb,
  whereAndOrder: string,
  bind: unknown[],
): Promise<FixedAssetDbRecord[]> {
  const rows = (await db.exec({
    sql: `SELECT fa.data, fp.user_id, fa.created_at, fa.updated_at, fp.data
      FROM fixed_assets fa
      JOIN fiscal_periods fp ON fp.id = fa.fiscal_period_id
      ${whereAndOrder}`,
    bind,
    returnValue: "resultRows",
    rowMode: "array",
  })) as Array<[string, string, number, number, string]>;
  return rows.map(([data, userId, createdAt, updatedAt, periodData]) => {
    const asset: FixedAssetDbRecord = {
      ...parseFixedAssetDbData(data),
      userId,
      createdAt: msToIso(createdAt),
      updatedAt: msToIso(updatedAt),
    };
    assertFixedAssetMatchesRules(asset, parseFiscalPeriodDbData(periodData));
    return asset;
  });
}

export async function insertFixedAsset(
  db: SqlDb,
  asset: FixedAssetDbRecord,
  now: number,
): Promise<void> {
  await db.exec({
    sql: `INSERT INTO fixed_assets(id, fiscal_period_id, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?)`,
    bind: [
      asset.id,
      asset.fiscalPeriodId,
      serializeFixedAssetDbData(asset),
      now,
      now,
    ],
  });
}
