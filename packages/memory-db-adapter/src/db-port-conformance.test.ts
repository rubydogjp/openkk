import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createSqliteDbAdapter,
  runMigrations,
  type DbSnapshot,
  type OpenkkDbPort,
  type SqlDb,
} from "@rubydogjp/openkk-server-ports";

import { createMemoryDbAdapter } from "./index";
import { runDbPortConformance } from "../../server-ports/src/db-port-conformance";

// 1) 既定のアダプタ（memory-db）。exec は同期 SQLite を async で包む。
runDbPortConformance("memory-db-adapter (sync transport)", {
  makeAdapter: () => createMemoryDbAdapter(),
  makeSeededAdapter: (seed) => createMemoryDbAdapter(seed),
});

// 2) 同じ共有コア(createSqliteDbAdapter)を「遅延非同期」搬送で動かす。SQL の実行を
//    マイクロタスクまで遅らせ、file-db-adapter の Worker 往復（prod/OPFS）と同じ
//    「呼び出し時点では結果が無い」性質を Node 上で再現する。memory(同期)では露見
//    しない同期前提のバグを検出し、両搬送で挙動が一致することを保証する。
async function createDeferredAdapter(seed?: DbSnapshot): Promise<OpenkkDbPort> {
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

  const sync = db as unknown as { exec(arg: unknown): unknown };
  const sqlDb: SqlDb = {
    exec: (arg) => Promise.resolve().then(() => sync.exec(arg)),
  };
  return createSqliteDbAdapter(sqlDb, seed);
}

runDbPortConformance("sqlite core (deferred async transport)", {
  makeAdapter: () => createDeferredAdapter(),
  makeSeededAdapter: (seed) => createDeferredAdapter(seed),
});
