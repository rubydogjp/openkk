import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  type DbSnapshot,
  type OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";
import {
  createSqliteDbAdapter,
  runMigrations,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-adapter";

export { type DbSnapshot } from "@rubydogjp/openkk-server-ports";

let sqliteModulePromise: ReturnType<typeof sqlite3InitModule> | null = null;

function initializeSqliteWasm() {
  if (sqliteModulePromise != null) return sqliteModulePromise;

  const initialization = sqlite3InitModule({
    print: () => {},
    printErr: (msg: string) => console.error("[sqlite-wasm]", msg),
  });
  sqliteModulePromise = initialization;
  void initialization.catch(() => {
    if (sqliteModulePromise === initialization) sqliteModulePromise = null;
  });
  return initialization;
}

export async function createMemoryDbAdapter(
  seed: DbSnapshot | null,
): Promise<OpenkkDbPort> {
  const sqlite3 = await initializeSqliteWasm();
  const db = new sqlite3.oo1.DB(":memory:");
  runMigrations(db);

  const sync = db as unknown as { exec(arg: unknown): unknown };
  const sqlDb: SqlDb = { exec: async (arg) => sync.exec(arg) };
  return createSqliteDbAdapter(sqlDb, seed);
}
