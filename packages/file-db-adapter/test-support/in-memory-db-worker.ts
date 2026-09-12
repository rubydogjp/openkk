import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-sqlite-adapter";

type WorkerMessage = {
  id: number;
  type: string;
  payload: unknown;
};

export class InMemoryDbWorker {
  static instances: InMemoryDbWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  private dbPromise: Promise<{ exec(arg: unknown): unknown }> | null = null;

  constructor() {
    InMemoryDbWorker.instances.push(this);
  }

  private getDb() {
    if (this.dbPromise == null) {
      this.dbPromise = (async () => {
        const sqlite3 = await sqlite3InitModule({
          print: () => {},
          printErr: () => {},
        });
        const db = new sqlite3.oo1.DB(":memory:");
        runMigrations(db);
        return db as unknown as { exec(arg: unknown): unknown };
      })();
    }
    return this.dbPromise;
  }

  postMessage(message: WorkerMessage): void {
    void (async () => {
      try {
        const db = await this.getDb();
        if (message.type === "init") {
          this.onmessage?.({
            data: { id: message.id, ok: true, result: null },
            source: null,
            currentTarget: null,
            srcElement: null,
            target: null,
          } as MessageEvent);
          return;
        }
        const wantsRows =
          typeof message.payload === "object" &&
          message.payload != null &&
          "returnValue" in message.payload &&
          message.payload.returnValue === "resultRows";
        const result = db.exec(message.payload);
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result: wantsRows ? result : null,
          },
          source: null,
          currentTarget: null,
          srcElement: null,
          target: null,
        } as MessageEvent);
      } catch (error) {
        this.onmessage?.({
          data: {
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          source: null,
          currentTarget: null,
          srcElement: null,
          target: null,
        } as MessageEvent);
      }
    })();
  }

  terminate(): void {
    this.terminated = true;
  }
}
