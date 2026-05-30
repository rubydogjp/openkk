import sqlite3InitModule, {
  type OpfsSAHPoolDatabase,
} from "@sqlite.org/sqlite-wasm";

import { runMigrations } from "@rubydogjp/openkk-server-ports";

export type FileSqliteInitOptions = {
  vfsName: string;
  dbFileName?: string;
};

export async function openFileSqliteDb(
  options: FileSqliteInitOptions,
): Promise<OpfsSAHPoolDatabase> {
  const sqlite3 = await sqlite3InitModule({
    print: () => undefined,
    printErr: (msg: string) => console.error("[sqlite-wasm]", msg),
  });

  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: options.vfsName,
  });

  const fileName = options.dbFileName ?? "openkk.sqlite3";
  const db = new pool.OpfsSAHPoolDb(fileName);

  runMigrations(db);
  return db;
}
