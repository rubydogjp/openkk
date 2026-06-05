import {
  createSqliteDbAdapter,
  type DbSnapshot,
  type OpenkkDbPort,
  type SqlDb,
} from "@rubydogjp/openkk-server-ports";
export { type DbSnapshot } from "@rubydogjp/openkk-server-ports";

export type FileDbAdapterOptions = {
  vfsName: string;
  dbFileName?: string;
};

type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

function createWorkerSqlDb(worker: Worker): SqlDb & {
  init(payload: { vfsName: string; dbFileName: string }): Promise<void>;
} {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);
    if (entry == null) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error ?? "sqlite worker error"));
  };

  // A worker crash (uncaught error or deserialization failure) never sends a
  // response, so reject every in-flight request instead of leaving them hung.
  function rejectAllPending(reason: string): void {
    const error = new Error(reason);
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(error);
    }
  }
  worker.onerror = (event) => {
    rejectAllPending(event.message || "sqlite worker crashed");
  };
  worker.onmessageerror = () => {
    rejectAllPending("sqlite worker message deserialization failed");
  };

  function send(type: string, payload: unknown): Promise<unknown> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, type, payload });
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  return {
    exec: (arg) => send("exec", arg),
    init: (payload) => send("init", payload).then(() => undefined),
  };
}

// OPFS の SAHPool は同一ファイルを複数ハンドルで開けない。1 ドキュメント内では
// worker / DB を 1 つだけに固定し、再マウント等での二重初期化を防ぐ。
let cachedAdapter: Promise<OpenkkDbPort> | null = null;
let cachedAdapterKey: string | null = null;

export function createFileDbAdapter(
  options: FileDbAdapterOptions,
  seed?: DbSnapshot,
): Promise<OpenkkDbPort> {
  const dbFileName = options.dbFileName ?? "openkk.sqlite3";
  const adapterKey = `${options.vfsName}\n${dbFileName}`;
  if (cachedAdapter != null && cachedAdapterKey !== adapterKey) {
    throw new Error("file DB adapter is already initialized with different options");
  }
  if (cachedAdapter == null) {
    cachedAdapterKey = adapterKey;
    cachedAdapter = (async () => {
      const worker = new Worker(new URL("./sqlite.worker.js", import.meta.url), {
        type: "module",
      });
      try {
        const db = createWorkerSqlDb(worker);
        await db.init({
          vfsName: options.vfsName,
          dbFileName,
        });
        return await createSqliteDbAdapter(db, seed);
      } catch (error) {
        cachedAdapter = null;
        cachedAdapterKey = null;
        worker.terminate();
        throw error;
      }
    })();
  }
  return cachedAdapter;
}
