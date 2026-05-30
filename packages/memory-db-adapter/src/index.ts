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
  // インメモリ用途では OPFS は不要。init 時に sqlite3 が OPFS VFS の自動導入を
  // 試みて出す「Ignoring inability to install OPFS …」の警告だけを抑制する。
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("OPFS")) return;
    (originalWarn as (...a: unknown[]) => void)(...args);
  };
  let sqlite3;
  try {
    sqlite3 = await sqlite3InitModule({
      print: () => undefined,
      printErr: (msg: string) => console.error("[sqlite-wasm]", msg),
    });
  } finally {
    console.warn = originalWarn;
  }
  const db = new sqlite3.oo1.DB(":memory:");
  runMigrations(db);
  // インメモリ DB は同期で動くため、async ポート契約には薄くラップするだけ。
  const sync = db as unknown as { exec(arg: unknown): unknown };
  const sqlDb: SqlDb = { exec: async (arg) => sync.exec(arg) };
  return createSqliteDbAdapter(sqlDb, seed);
}
