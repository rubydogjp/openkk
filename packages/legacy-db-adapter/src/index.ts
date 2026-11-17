export type LegacyDbAdapterOptions = {
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

function dbLocation(options: LegacyDbAdapterOptions) {
  return { vfsName: options.vfsName, dbFileName: options.dbFileName };
}

type PoolDirectoryRoot = {
  getDirectoryHandle(
    name: string,
    options: { create: false },
  ): Promise<unknown>;
};

export async function hasLegacyDbStorage(vfsName: string): Promise<boolean> {
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

export async function exportLegacyDbBytes(
  options: LegacyDbAdapterOptions,
): Promise<Uint8Array | null> {
  if (!(await hasLegacyDbStorage(options.vfsName))) return null;
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
