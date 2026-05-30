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

// OPFS の永続 DB は 1 つの接続でしか開けない。Web Lock を worker の生存中
// 保持し続けることで「同時に 1 タブだけ」を強制する。2 つ目のタブは取得に
// 失敗し、ANOTHER_TAB を投げて UI 側で案内する。
async function acquireSingleTabLock(name: string): Promise<boolean> {
  if (typeof navigator === "undefined" || navigator.locks == null) return true;
  return new Promise<boolean>((resolve) => {
    // 空いていれば即取得。別タブが保持中ならタイムアウトで諦める
    // (リロード時の一瞬の保持を取りこぼさないよう、ifAvailable ではなく待機)。
    void navigator.locks
      .request(name, { mode: "exclusive", signal: AbortSignal.timeout(500) }, () => {
        resolve(true);
        // worker が終了するまで解放しない（= ロックを保持し続ける）。
        return new Promise<void>(() => undefined);
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
