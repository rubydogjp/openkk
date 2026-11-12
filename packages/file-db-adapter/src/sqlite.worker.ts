import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-sqlite-adapter";

type ExecArg =
  | string
  | { sql: string; bind?: unknown[]; returnValue?: string; rowMode?: string };

type SyncDb = {
  exec(arg: ExecArg): unknown;
  selectValue(sql: string): unknown;
};

type DbLocation = { vfsName: string; dbFileName: string };

type Incoming =
  | { id: number; type: "init"; payload: DbLocation }
  | { id: number; type: "export"; payload: DbLocation }
  | { id: number; type: "exec"; payload: ExecArg };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
  postMessage(message: unknown): void;
};

let db: SyncDb | null = null;

function holdUntilWorkerEnds(): Promise<void> {
  return new Promise<void>(() => {});
}

async function acquireSingleTabLock(name: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.locks == null) return;
  const locks = navigator.locks;
  const acquiredImmediately = await new Promise<boolean>((resolve) => {
    void locks.request(
      name,
      { mode: "exclusive", ifAvailable: true },
      (lock) => {
        resolve(lock != null);
        return lock != null ? holdUntilWorkerEnds() : null;
      },
    );
  });
  if (acquiredImmediately) return;
  workerScope.postMessage({ event: "waiting_for_another_tab" });
  await new Promise<void>((resolve) => {
    void locks.request(name, { mode: "exclusive" }, () => {
      resolve();
      return holdUntilWorkerEnds();
    });
  });
}

async function openPool(location: DbLocation) {
  await acquireSingleTabLock(`openkk-db:${location.dbFileName}`);
  const sqlite3 = await sqlite3InitModule({
    print: () => {},
    printErr: (message: string) => console.error("[sqlite-wasm]", message),
  });
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: location.vfsName });
  return { sqlite3, pool };
}

async function init(location: DbLocation): Promise<void> {
  const { pool } = await openPool(location);
  const opfsDb = new pool.OpfsSAHPoolDb(
    location.dbFileName,
  ) as unknown as SyncDb;
  runMigrations(opfsDb);
  db = opfsDb;
}

async function exportDb(location: DbLocation): Promise<Uint8Array | null> {
  const { sqlite3, pool } = await openPool(location);
  const storedNames = [location.dbFileName, `/${location.dbFileName}`];
  if (!pool.getFileNames().some((name) => storedNames.includes(name))) {
    return null;
  }
  const opfsDb = new pool.OpfsSAHPoolDb(location.dbFileName);
  try {
    return sqlite3.capi.sqlite3_js_db_export(opfsDb);
  } finally {
    opfsDb.close();
  }
}

async function handle(message: Incoming): Promise<unknown> {
  switch (message.type) {
    case "init":
      await init(message.payload);
      return null;
    case "export":
      return exportDb(message.payload);
    case "exec": {
      if (db == null) throw new Error("db not initialized");
      const arg = message.payload;
      const wantsRows =
        typeof arg === "object" && arg.returnValue === "resultRows";
      const result = db.exec(arg);
      return wantsRows ? result : null;
    }
  }
}

workerScope.onmessage = async (event) => {
  const message = event.data;
  try {
    const result = await handle(message);
    workerScope.postMessage({ id: message.id, ok: true, result });
  } catch (error) {
    workerScope.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
