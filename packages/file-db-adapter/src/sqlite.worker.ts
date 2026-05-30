// SQLite (OPFS SAHPool) を動かす Web Worker。
// createSyncAccessHandle は Worker でしか提供されないため、永続 DB はここで動かす。
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-server-ports";

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

async function init(payload: {
  vfsName: string;
  dbFileName: string;
}): Promise<void> {
  const sqlite3 = await sqlite3InitModule({
    print: () => undefined,
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
      ctx.postMessage({ id: message.id, ok: true });
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
      result: wantsRows ? result : undefined,
    });
  } catch (error) {
    ctx.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
