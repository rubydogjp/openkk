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

function holdUntilWorkerEnds(): Promise<void> {
  return new Promise<void>(() => {});
}

async function acquireSingleTabLock(name: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.locks == null) return;
  const locks = navigator.locks;
  const acquiredImmediately = await new Promise<boolean>((resolve) => {
    void locks.request(name, { mode: "exclusive", ifAvailable: true }, (lock) => {
      resolve(lock != null);
      return lock != null ? holdUntilWorkerEnds() : null;
    });
  });
  if (acquiredImmediately) return;
  ctx.postMessage({ event: "waiting_for_another_tab" });
  await new Promise<void>((resolve) => {
    void locks.request(name, { mode: "exclusive" }, () => {
      resolve();
      return holdUntilWorkerEnds();
    });
  });
}

async function init(payload: {
  vfsName: string;
  dbFileName: string;
}): Promise<void> {
  await acquireSingleTabLock(`openkk-db:${payload.dbFileName}`);
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
