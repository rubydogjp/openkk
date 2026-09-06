import type { OpenkkDbPort } from "../db-adapter.js";
import { createClosingsDb, createPreClosingsDb } from "./closing-store.js";
import { createEntriesDb } from "./entry-store.js";
import { createFiscalPeriodsDb } from "./fiscal-period-store.js";
import { createFixedAssetsDb } from "./fixed-asset-store.js";
import { createMasterDataDb } from "./master-data-store.js";
import { seedStores, type DbSnapshot } from "./seed-store.js";
import { serializeOpenkkDbPortOperations } from "./serialized-port.js";
import type { SqlDb } from "./sql-db.js";

export type { DbSnapshot } from "./seed-store.js";

export async function createSqliteDbAdapter(
  db: SqlDb,
  seed?: DbSnapshot,
): Promise<OpenkkDbPort> {
  await db.exec("PRAGMA foreign_keys = ON");
  if (seed != null) await seedStores(db, seed);
  return serializeOpenkkDbPortOperations({
    fiscalPeriods: createFiscalPeriodsDb(db),
    entries: createEntriesDb(db),
    fixedAssets: createFixedAssetsDb(db),
    preClosings: createPreClosingsDb(db),
    closings: createClosingsDb(db),
    masterData: createMasterDataDb(),
  });
}
