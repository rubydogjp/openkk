import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { OpenkkDbPort } from "@rubydogjp/openkk-server-ports";
import {
  createSqliteDbAdapter,
  runMigrations,
  SCHEMA_VERSION,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-adapter";

export const OPENKK_DOCUMENT_EXTENSION = ".openkk";

export type DocumentFileProblem = "not_sqlite" | "not_openkk" | "newer_schema";

export class DocumentFileFormatError extends Error {
  readonly problem: DocumentFileProblem;

  constructor(problem: DocumentFileProblem, message: string) {
    super(message);
    this.name = "DocumentFileFormatError";
    this.problem = problem;
  }
}

export type DocumentDbAdapter = {
  db: OpenkkDbPort;
  changedOnOpen: boolean;
  exportBytes(): Uint8Array;
  onChange(listener: () => void): () => void;
  close(): void;
};

const SQLITE_HEADER = "SQLite format 3\u0000";
const SCHEMA_VERSION_QUERY =
  "SELECT value FROM openkk_meta WHERE key='schema_version'";
const META_TABLE_QUERY =
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='openkk_meta'";
const ANY_TABLE_QUERY = "SELECT 1 FROM sqlite_master WHERE type='table'";

let sqliteModulePromise: ReturnType<typeof sqlite3InitModule> | null = null;

function initializeSqliteWasm() {
  if (sqliteModulePromise != null) return sqliteModulePromise;
  const initialization = sqlite3InitModule({
    print: () => {},
    printErr: (message: string) => console.error("[sqlite-wasm]", message),
  });
  sqliteModulePromise = initialization;
  void initialization.catch(() => {
    if (sqliteModulePromise === initialization) sqliteModulePromise = null;
  });
  return initialization;
}

export async function createDocumentDbAdapter(
  bytes: Uint8Array | null,
): Promise<DocumentDbAdapter> {
  if (bytes != null) assertSqliteHeader(bytes);
  const sqlite3 = await initializeSqliteWasm();
  const { capi, wasm } = sqlite3;
  const database = new sqlite3.oo1.DB(":memory:");
  try {
    if (bytes != null) {
      const pointer = wasm.allocFromTypedArray(bytes);
      const resultCode = capi.sqlite3_deserialize(
        database.pointer!,
        "main",
        pointer,
        bytes.byteLength,
        bytes.byteLength,
        capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          capi.SQLITE_DESERIALIZE_RESIZEABLE,
      );
      if (resultCode !== capi.SQLITE_OK) {
        throw new DocumentFileFormatError(
          "not_sqlite",
          `sqlite3_deserialize failed: ${resultCode}`,
        );
      }
      assertOpenkkDocument(database);
    }
    const changesBefore = capi.sqlite3_total_changes(database.pointer!);
    runMigrations(database);
    const changedOnOpen =
      bytes == null ||
      capi.sqlite3_total_changes(database.pointer!) !== changesBefore;

    const sync = database as unknown as { exec(arg: unknown): unknown };
    const sqlDb: SqlDb = { exec: async (arg) => sync.exec(arg) };
    const listeners = new Set<() => void>();
    const port = await createSqliteDbAdapter(sqlDb, null);
    const db = notifyAfterChanges(
      port,
      () => capi.sqlite3_total_changes(database.pointer!),
      () => {
        for (const listener of listeners) listener();
      },
    );
    return {
      db,
      changedOnOpen,
      exportBytes: () => capi.sqlite3_js_db_export(database.pointer!),
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

function assertSqliteHeader(bytes: Uint8Array): void {
  const header = new TextDecoder("latin1").decode(
    bytes.subarray(0, SQLITE_HEADER.length),
  );
  if (header !== SQLITE_HEADER) {
    throw new DocumentFileFormatError(
      "not_sqlite",
      "document is not a SQLite database",
    );
  }
}

function assertOpenkkDocument(database: {
  selectValue(sql: string): unknown;
}): void {
  if (database.selectValue(META_TABLE_QUERY) == null) {
    if (database.selectValue(ANY_TABLE_QUERY) == null) return;
    throw new DocumentFileFormatError(
      "not_openkk",
      "SQLite database has no openkk_meta table",
    );
  }
  const version = Number(database.selectValue(SCHEMA_VERSION_QUERY));
  if (Number.isSafeInteger(version) && version > SCHEMA_VERSION) {
    throw new DocumentFileFormatError(
      "newer_schema",
      `document schema ${version} is newer than ${SCHEMA_VERSION}`,
    );
  }
}

function notifyAfterChanges(
  port: OpenkkDbPort,
  totalChanges: () => number,
  notify: () => void,
): OpenkkDbPort {
  let lastSeen = totalChanges();
  const settle = () => {
    const current = totalChanges();
    if (current === lastSeen) return;
    lastSeen = current;
    notify();
  };
  const wrapNamespace = <T extends object>(namespace: T): T =>
    Object.fromEntries(
      Object.entries(namespace).map(([name, member]) => [
        name,
        typeof member === "function"
          ? async (...args: unknown[]) => {
              try {
                return await (
                  member as (...callArgs: unknown[]) => Promise<unknown>
                ).apply(namespace, args);
              } finally {
                settle();
              }
            }
          : member,
      ]),
    ) as T;
  return {
    fiscalPeriods: wrapNamespace(port.fiscalPeriods),
    entries: wrapNamespace(port.entries),
    fixedAssets: wrapNamespace(port.fixedAssets),
    preClosings: wrapNamespace(port.preClosings),
    closings: wrapNamespace(port.closings),
    masterData: wrapNamespace(port.masterData),
  };
}
