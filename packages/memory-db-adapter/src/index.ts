import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createSqliteDbAdapter,
  runMigrations,
  type DbSnapshot,
  type OpenkkDbPort,
  type SqlDb,
} from "@rubydogjp/openkk-server-ports";

export type MemoryDbSnapshot = DbSnapshot;

export async function createMemoryDbAdapter(
  seed?: MemoryDbSnapshot,
): Promise<OpenkkDbPort> {
  const sqlite3 = await sqlite3InitModule({
    print: () => undefined,
    printErr: (msg: string) => console.error("[sqlite-wasm]", msg),
  });
  const db = new sqlite3.oo1.DB(":memory:");
  runMigrations(db);
  // インメモリ DB は同期で動くため、async ポート契約には薄くラップするだけ。
  const sync = db as unknown as { exec(arg: unknown): unknown };
  const sqlDb: SqlDb = { exec: async (arg) => sync.exec(arg) };
  return createSqliteDbAdapter(sqlDb, seed);
}
