// テスト用の Worker スタブ。ブラウザの sqlite.worker.js の代わりに、Node 上で
// sqlite-wasm(:memory:) を動かし、file-db-adapter の Worker メッセージプロトコル
// ({id,type,payload} → {id,ok,result/error}) を忠実に話す。これにより
// createFileDbAdapter の実トランスポート（createWorkerSqlDb の往復）を Node で検証できる。
// vitest に依存しないが、テスト専用のためビルドからは除外する。

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-server-ports";

type WorkerMessage = {
  id: number;
  type: string;
  payload: unknown;
};

export class RealDbWorker {
  static instances: RealDbWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  private dbPromise: Promise<{ exec(arg: unknown): unknown }> | null = null;

  constructor() {
    RealDbWorker.instances.push(this);
  }

  private getDb() {
    if (this.dbPromise == null) {
      this.dbPromise = (async () => {
        const sqlite3 = await sqlite3InitModule({
          print: () => undefined,
          printErr: () => undefined,
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
            data: { id: message.id, ok: true },
          } as MessageEvent);
          return;
        }
        const arg = message.payload as { returnValue?: string };
        const wantsRows =
          typeof arg === "object" && arg?.returnValue === "resultRows";
        const result = db.exec(message.payload);
        this.onmessage?.({
          data: {
            id: message.id,
            ok: true,
            result: wantsRows ? result : undefined,
          },
        } as MessageEvent);
      } catch (error) {
        this.onmessage?.({
          data: {
            id: message.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        } as MessageEvent);
      }
    })();
  }

  terminate(): void {
    this.terminated = true;
  }
}
