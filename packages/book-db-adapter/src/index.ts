import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-engine";
import {
  createSqliteDbAdapter,
  LAST_CHANGED_AT_QUERY,
  parseLastChangedAt,
  runMigrations,
  SCHEMA_VERSION,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-db-adapter";

export type { DbSnapshot } from "@rubydogjp/openkk-engine";

export type BookFileProblem = "not_sqlite" | "not_openkk" | "newer_schema";

export class BookFileFormatError extends Error {
  readonly problem: BookFileProblem;

  constructor(problem: BookFileProblem, message: string) {
    super(message);
    this.name = "BookFileFormatError";
    this.problem = problem;
  }
}

export type BookDbAdapter = {
  db: OpenkkDbPort;
  changedOnOpen: boolean;
  lastChangedAtOnOpen: number | null;
  lastChangedAt(): number;
  restoreLastChangedAt(stamp: number): void;
  listFiscalPeriodIds(): string[];
  compact(): void;
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
const RESTORE_LAST_CHANGED_AT_SQL =
  "INSERT OR REPLACE INTO openkk_meta(key, value) VALUES('last_changed_at', ?)";
const FISCAL_PERIOD_IDS_QUERY =
  "SELECT id FROM fiscal_periods ORDER BY created_at ASC, id ASC";

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

export async function createBookDbAdapter(
  bytes: Uint8Array | null,
): Promise<BookDbAdapter> {
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
        throw new BookFileFormatError(
          "not_sqlite",
          `sqlite3_deserialize failed: ${resultCode}`,
        );
      }
      assertOpenkkBook(database);
    }
    const changesBefore = capi.sqlite3_total_changes(database.pointer!);
    const lastChangedAtOnOpen =
      bytes != null && database.selectValue(META_TABLE_QUERY) != null
        ? parseLastChangedAt(database.selectValue(LAST_CHANGED_AT_QUERY))
        : null;
    runMigrations(database);
    const changedOnOpen =
      bytes == null ||
      capi.sqlite3_total_changes(database.pointer!) !== changesBefore;

    const sync = database as unknown as { exec(arg: unknown): unknown };
    const sqlDb: SqlDb = { exec: async (arg) => sync.exec(arg) };
    const listeners = new Set<() => void>();
    const port = await createSqliteDbAdapter(sqlDb, null);
    const lastSeenChanges = createChangeCounter(() =>
      capi.sqlite3_total_changes(database.pointer!),
    );
    const db = notifyAfterChanges(port, lastSeenChanges, () => {
      for (const listener of listeners) listener();
    });
    return {
      db,
      changedOnOpen,
      lastChangedAtOnOpen,
      lastChangedAt() {
        const stamp = parseLastChangedAt(
          database.selectValue(LAST_CHANGED_AT_QUERY),
        );
        if (stamp == null) throw new Error("the book has no change stamp");
        return stamp;
      },
      restoreLastChangedAt(stamp) {
        database.exec({
          sql: RESTORE_LAST_CHANGED_AT_SQL,
          bind: [String(stamp)],
        });
        lastSeenChanges.reset();
      },
      listFiscalPeriodIds: () =>
        database.selectValues(FISCAL_PERIOD_IDS_QUERY).map(String),
      compact() {
        database.exec("VACUUM");
        lastSeenChanges.reset();
      },
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

export async function createBookFileBytes(
  snapshot: DbSnapshot,
): Promise<Uint8Array> {
  const sqlite3 = await initializeSqliteWasm();
  const database = new sqlite3.oo1.DB(":memory:");
  try {
    runMigrations(database);
    const sync = database as unknown as { exec(arg: unknown): unknown };
    await createSqliteDbAdapter(
      { exec: async (arg) => sync.exec(arg) },
      snapshot,
    );
    return sqlite3.capi.sqlite3_js_db_export(database.pointer!);
  } finally {
    database.close();
  }
}

function assertSqliteHeader(bytes: Uint8Array): void {
  const header = new TextDecoder("latin1").decode(
    bytes.subarray(0, SQLITE_HEADER.length),
  );
  if (header !== SQLITE_HEADER) {
    throw new BookFileFormatError(
      "not_sqlite",
      "document is not a SQLite database",
    );
  }
}

function assertOpenkkBook(database: {
  selectValue(sql: string): unknown;
}): void {
  if (database.selectValue(META_TABLE_QUERY) == null) {
    if (database.selectValue(ANY_TABLE_QUERY) == null) return;
    throw new BookFileFormatError(
      "not_openkk",
      "SQLite database has no openkk_meta table",
    );
  }
  const version = Number(database.selectValue(SCHEMA_VERSION_QUERY));
  if (Number.isSafeInteger(version) && version > SCHEMA_VERSION) {
    throw new BookFileFormatError(
      "newer_schema",
      `document schema ${version} is newer than ${SCHEMA_VERSION}`,
    );
  }
}

type ChangeCounter = {
  hasNewChanges(): boolean;
  reset(): void;
};

function createChangeCounter(totalChanges: () => number): ChangeCounter {
  let lastSeen = totalChanges();
  return {
    hasNewChanges() {
      const current = totalChanges();
      if (current === lastSeen) return false;
      lastSeen = current;
      return true;
    },
    reset() {
      lastSeen = totalChanges();
    },
  };
}

function notifyAfterChanges(
  port: OpenkkDbPort,
  changes: ChangeCounter,
  notify: () => void,
): OpenkkDbPort {
  const settle = () => {
    if (changes.hasNewChanges()) notify();
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
