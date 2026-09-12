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

import { createMemoryDbAdapter } from "./index.js";
import { runDbPortConformance } from "../../server-ports/test-support/db-port-conformance.js";

runDbPortConformance("memory-db-adapter (sync transport)", {
  makeAdapter: () => createMemoryDbAdapter(null),
  makeSeededAdapter: (seed) => createMemoryDbAdapter(seed),
});

async function createDeferredSqlTransportAdapter(
  seed: DbSnapshot | null,
): Promise<OpenkkDbPort> {
  const sqlite3 = await sqlite3InitModule({
    print: () => undefined,
    printErr: (msg: string) => console.error("[sqlite-wasm]", msg),
  });
  const db = new sqlite3.oo1.DB(":memory:");
  runMigrations(db);

  const sync = db as unknown as { exec(arg: unknown): unknown };
  const sqlDb: SqlDb = {
    exec: (arg) => Promise.resolve().then(() => sync.exec(arg)),
  };
  return createSqliteDbAdapter(sqlDb, seed);
}

runDbPortConformance("sqlite core (deferred async transport)", {
  makeAdapter: () => createDeferredSqlTransportAdapter(null),
  makeSeededAdapter: (seed) => createDeferredSqlTransportAdapter(seed),
});
