import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-sqlite-adapter";

type ExecArg =
  | string
  | { sql: string; bind?: unknown[]; returnValue?: string; rowMode?: string };

type SyncDb = {
  exec(arg: ExecArg): unknown;
  selectValue(sql: string): unknown;
};

type Incoming =
  | { id: number; type: "init"; payload: { vfsName: string; dbFileName: string } }
  | { id: number; type: "exec"; payload: ExecArg };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
  postMessage(message: unknown): void;
};

let db: SyncDb | null = null;

// SAHPool permits one tab to hold the database connection.
async function acquireSingleTabLock(name: string): Promise<boolean> {
  if (typeof navigator === "undefined" || navigator.locks == null) return true;
  return new Promise<boolean>((resolve) => {
    void navigator.locks
      .request(name, { mode: "exclusive", signal: AbortSignal.timeout(500) }, () => {
        resolve(true);
        return new Promise<void>(() => {});
      })
      .catch(() => resolve(false));
  });
}

async function init(payload: {
  vfsName: string;
  dbFileName: string;
}): Promise<void> {
  const held = await acquireSingleTabLock(`openkk-db:${payload.dbFileName}`);
  if (!held) throw new Error("ANOTHER_TAB");
  const sqlite3 = await sqlite3InitModule({
    print: () => {},
    printErr: (msg: string) => console.error("[sqlite-wasm]", msg),
  });
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: payload.vfsName });
  const opfsDb = new pool.OpfsSAHPoolDb(payload.dbFileName) as unknown as SyncDb;
  runMigrations(opfsDb);
  db = opfsDb;
}

ctx.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      await init(message.payload);
      ctx.postMessage({ id: message.id, ok: true, result: null });
      return;
    }
    if (db == null) throw new Error("db not initialized");
    const arg = message.payload;
    const wantsRows =
      typeof arg === "object" && arg.returnValue === "resultRows";
    const result = db.exec(arg);
    ctx.postMessage({
      id: message.id,
      ok: true,
      result: wantsRows ? result : null,
    });
  } catch (error) {
    ctx.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
