import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-server-ports";
import {
  createSqliteDbAdapter,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-adapter";

import {
  browserPersistentStorage,
  requestPersistentStorage,
} from "./persistent-storage.js";

export { type DbSnapshot } from "@rubydogjp/openkk-server-ports";

export type FileDbAdapterOptions = {
  vfsName: string;
  dbFileName: string;
  onWaitingForAnotherTab: (() => void) | null;
};

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

type WorkerEvent = { event: "waiting_for_another_tab" };

function isWorkerEvent(data: unknown): data is WorkerEvent {
  return (
    typeof data === "object" &&
    data != null &&
    "event" in data &&
    data.event === "waiting_for_another_tab"
  );
}

type SendToWorker = (type: string, payload: unknown) => Promise<unknown>;

function connectSqliteWorker(
  worker: Worker,
  onFatal: (error: Error) => void,
  onWaitingForAnotherTab: (() => void) | null,
): SendToWorker {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let fatalError: Error | null = null;

  worker.onmessage = (event: MessageEvent<WorkerResponse | WorkerEvent>) => {
    if (isWorkerEvent(event.data)) {
      onWaitingForAnotherTab?.();
      return;
    }
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

  return send;
}

function createSqliteWorker(): Worker {
  return new Worker(new URL("./sqlite.worker.js", import.meta.url), {
    type: "module",
  });
}

function dbLocation(options: FileDbAdapterOptions) {
  return { vfsName: options.vfsName, dbFileName: options.dbFileName };
}

async function createWorkerSqlDb(
  worker: Worker,
  onFatal: (error: Error) => void,
  options: FileDbAdapterOptions,
): Promise<SqlDb> {
  const send = connectSqliteWorker(
    worker,
    onFatal,
    options.onWaitingForAnotherTab,
  );
  await send("init", dbLocation(options));
  return { exec: (arg) => send("exec", arg) };
}

let cachedAdapter: Promise<OpenkkDbPort> | null = null;
let cachedAdapterKey: string | null = null;

export function createFileDbAdapter(
  options: FileDbAdapterOptions,
  seed: DbSnapshot | null,
): Promise<OpenkkDbPort> {
  const adapterKey = `${options.vfsName}\n${options.dbFileName}`;
  if (cachedAdapter != null && cachedAdapterKey !== adapterKey) {
    throw new Error(
      "file DB adapter is already initialized with different options",
    );
  }
  if (cachedAdapter == null) {
    cachedAdapterKey = adapterKey;
    const worker = createSqliteWorker();
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
          options,
        );
        const adapter = await createSqliteDbAdapter(db, seed);
        void requestPersistentStorage(browserPersistentStorage());
        return adapter;
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

type PoolDirectoryRoot = {
  getDirectoryHandle(
    name: string,
    options: { create: false },
  ): Promise<unknown>;
};

export async function hasFileDbStorage(vfsName: string): Promise<boolean> {
  const storage: unknown =
    typeof navigator === "object" ? navigator.storage : null;
  if (
    typeof storage !== "object" ||
    storage == null ||
    !("getDirectory" in storage) ||
    typeof storage.getDirectory !== "function"
  ) {
    return false;
  }
  const root = (await storage.getDirectory()) as PoolDirectoryRoot;
  try {
    await root.getDirectoryHandle(`.${vfsName}`, { create: false });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

export async function exportFileDbBytes(
  options: FileDbAdapterOptions,
): Promise<Uint8Array | null> {
  if (!(await hasFileDbStorage(options.vfsName))) return null;
  const worker = createSqliteWorker();
  try {
    const send = connectSqliteWorker(
      worker,
      () => {},
      options.onWaitingForAnotherTab,
    );
    const bytes = await send("export", dbLocation(options));
    return bytes instanceof Uint8Array ? bytes : null;
  } finally {
    worker.terminate();
  }
}
