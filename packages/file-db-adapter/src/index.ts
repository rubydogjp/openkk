import {
  type DbSnapshot,
  type OpenkkDbPort,
} from "@rubydogjp/openkk-server-ports";
import {
  createSqliteDbAdapter,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-adapter";
export { type DbSnapshot } from "@rubydogjp/openkk-server-ports";

export type FileDbAdapterOptions = {
  vfsName: string;
  dbFileName: string | null;
};

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

async function createWorkerSqlDb(
  worker: Worker,
  onFatal: (error: Error) => void,
  initPayload: { vfsName: string; dbFileName: string },
): Promise<SqlDb> {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let fatalError: Error | null = null;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const { id } = response;
    const entry = pending.get(id);
    if (entry == null) return;
    pending.delete(id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.error));
  };

  function failWorker(reason: string): void {
    if (fatalError != null) return;
    const error = new Error(reason);
    fatalError = error;
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(error);
    }
    onFatal(error);
  }
  worker.onerror = (event) => {
    failWorker(event.message || "sqlite worker crashed");
  };
  worker.onmessageerror = () => {
    failWorker("sqlite worker message deserialization failed");
  };

  function send(type: string, payload: unknown): Promise<unknown> {
    if (fatalError != null) return Promise.reject(fatalError);
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

  await send("init", initPayload);
  return { exec: (arg) => send("exec", arg) };
}

let cachedAdapter: Promise<OpenkkDbPort> | null = null;
let cachedAdapterKey: string | null = null;

export function createFileDbAdapter(
  options: FileDbAdapterOptions,
  seed: DbSnapshot | null,
): Promise<OpenkkDbPort> {
  const dbFileName = options.dbFileName ?? "openkk.sqlite3";
  const adapterKey = `${options.vfsName}\n${dbFileName}`;
  if (cachedAdapter != null && cachedAdapterKey !== adapterKey) {
    throw new Error(
      "file DB adapter is already initialized with different options",
    );
  }
  if (cachedAdapter == null) {
    cachedAdapterKey = adapterKey;
    const worker = new Worker(new URL("./sqlite.worker.js", import.meta.url), {
      type: "module",
    });
    const initialization = (async () => {
      try {
        const db = await createWorkerSqlDb(
          worker,
          () => {
            worker.terminate();
            if (cachedAdapter === initialization) {
              cachedAdapter = null;
              cachedAdapterKey = null;
            }
          },
          { vfsName: options.vfsName, dbFileName },
        );
        return await createSqliteDbAdapter(db, seed);
      } catch (error) {
        cachedAdapter = null;
        cachedAdapterKey = null;
        worker.terminate();
        throw error;
      }
    })();
    cachedAdapter = initialization;
  }
  return cachedAdapter;
}
