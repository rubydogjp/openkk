import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type {
  DbSnapshot,
  EntryDbRecord,
  FiscalPeriodDbRecord,
  FixedAssetDbRecord,
  OpenkkDbPort,
} from "@rubydogjp/openkk-engine";
import {
  createSqliteDbAdapter,
  LARGEST_LAST_CHANGED_AT_IN_A_BOOK_FILE,
  LAST_CHANGED_AT_QUERY,
  parseLastChangedAt,
  runMigrations,
  SCHEMA_VERSION,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-db-adapter";

export type { DbSnapshot } from "@rubydogjp/openkk-engine";

export const MAX_BOOK_FILE_BYTES = 64 * 1024 * 1024;

export type BookFileProblem =
  | "too_large"
  | "not_sqlite"
  | "not_openkk"
  | "newer_schema"
  | "invalid_content";

export class BookFileFormatError extends Error {
  readonly problem: BookFileProblem;

  constructor(problem: BookFileProblem, message: string) {
    super(message);
    this.name = "BookFileFormatError";
    this.problem = problem;
  }
}

export class BookEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookEnvironmentError";
  }
}

export type StoredFiscalPeriodLabel = {
  name: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type StoredFiscalPeriod = {
  id: string | null;
  label: StoredFiscalPeriodLabel;
};

export type BookPeriodRecords = {
  fiscalPeriod: FiscalPeriodDbRecord;
  entries: EntryDbRecord[];
  fixedAssets: FixedAssetDbRecord[];
};

export type BookDbAdapter = {
  db: OpenkkDbPort;
  changedOnOpen: boolean;
  lastChangedAtOnOpen: number | null;
  lastChangedAt(): number;
  restoreLastChangedAt(stamp: number): void;
  listFiscalPeriodIds(): string[];
  readStoredFiscalPeriodLabel(fiscalPeriodId: string): StoredFiscalPeriodLabel;
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
const FISCAL_PERIOD_DATA_QUERY = "SELECT data FROM fiscal_periods WHERE id = ?";
const ALL_FISCAL_PERIODS_QUERY =
  "SELECT id, data FROM fiscal_periods ORDER BY created_at ASC, id ASC";
const SQLITE_RESULT_CODE_MASK = 0xff;
const SQLITE_NOMEM = 7;
const SQLITE_IOERR = 10;
const SQLITE_FULL = 13;
const ENVIRONMENT_SQLITE_RESULT_CODES: ReadonlySet<number> = new Set([
  SQLITE_NOMEM,
  SQLITE_IOERR,
  SQLITE_FULL,
]);
const ENVIRONMENT_ERROR_NAMES: ReadonlySet<string> = new Set([
  "BookEnvironmentError",
  "WasmAllocError",
  "RuntimeError",
  "InternalError",
]);
const MEMORY_RANGE_ERROR_PATTERN =
  /memory|allocation|array buffer|array length/i;
const UNKNOWN_FISCAL_PERIOD_LABEL: StoredFiscalPeriodLabel = {
  name: null,
  startDate: null,
  endDate: null,
};

function parseStoredFiscalPeriodLabel(data: unknown): StoredFiscalPeriodLabel {
  if (typeof data !== "string") return UNKNOWN_FISCAL_PERIOD_LABEL;
  let stored: unknown;
  try {
    stored = JSON.parse(data);
  } catch {
    return UNKNOWN_FISCAL_PERIOD_LABEL;
  }
  if (typeof stored !== "object" || stored === null) {
    return UNKNOWN_FISCAL_PERIOD_LABEL;
  }
  const text = (key: string) => {
    const value = (stored as Record<string, unknown>)[key];
    return typeof value === "string" && value !== "" ? value : null;
  };
  return {
    name: text("name"),
    startDate: text("startDate"),
    endDate: text("endDate"),
  };
}

export function isBookContentError(error: unknown): boolean {
  if (error instanceof BookFileFormatError) return true;
  if (!(error instanceof Error)) return false;
  if (ENVIRONMENT_ERROR_NAMES.has(error.name)) return false;
  if (
    error instanceof RangeError &&
    MEMORY_RANGE_ERROR_PATTERN.test(error.message)
  ) {
    return false;
  }
  const resultCode: unknown = "resultCode" in error ? error.resultCode : null;
  if (
    typeof resultCode === "number" &&
    ENVIRONMENT_SQLITE_RESULT_CODES.has(resultCode & SQLITE_RESULT_CODE_MASK)
  ) {
    return false;
  }
  if (error instanceof AggregateError) {
    return error.errors.every(isBookContentError);
  }
  return error.cause == null || isBookContentError(error.cause);
}

export function assertBookFileSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_BOOK_FILE_BYTES) {
    throw new BookFileFormatError(
      "too_large",
      `book file is larger than ${MAX_BOOK_FILE_BYTES} bytes`,
    );
  }
}

export async function readBookRecords(
  book: Pick<BookDbAdapter, "db" | "listFiscalPeriodIds">,
): Promise<BookPeriodRecords[]> {
  const periods: BookPeriodRecords[] = [];
  for (const fiscalPeriodId of book.listFiscalPeriodIds()) {
    const fiscalPeriod = await book.db.fiscalPeriods.getById(fiscalPeriodId);
    if (fiscalPeriod == null || fiscalPeriod.id !== fiscalPeriodId) {
      throw new BookFileFormatError(
        "invalid_content",
        `fiscal period row ${fiscalPeriodId} holds another period's data`,
      );
    }
    periods.push({
      fiscalPeriod,
      entries: await book.db.entries.getAll(fiscalPeriodId),
      fixedAssets: await book.db.fixedAssets.getAll(fiscalPeriodId),
    });
  }
  return periods;
}

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
      if (resultCode === capi.SQLITE_NOMEM) {
        throw new BookEnvironmentError("sqlite3_deserialize ran out of memory");
      }
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
        ? readStoredLastChangedAt(database)
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
      readStoredFiscalPeriodLabel: (fiscalPeriodId) =>
        parseStoredFiscalPeriodLabel(
          database.selectValue(FISCAL_PERIOD_DATA_QUERY, [fiscalPeriodId]),
        ),
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

export async function readStoredFiscalPeriods(
  bytes: Uint8Array,
): Promise<StoredFiscalPeriod[]> {
  try {
    assertSqliteHeader(bytes);
    const sqlite3 = await initializeSqliteWasm();
    const { capi, wasm } = sqlite3;
    const database = new sqlite3.oo1.DB(":memory:");
    try {
      const resultCode = capi.sqlite3_deserialize(
        database.pointer!,
        "main",
        wasm.allocFromTypedArray(bytes),
        bytes.byteLength,
        bytes.byteLength,
        capi.SQLITE_DESERIALIZE_FREEONCLOSE,
      );
      if (resultCode !== capi.SQLITE_OK) return [];
      return (
        database.exec({
          sql: ALL_FISCAL_PERIODS_QUERY,
          returnValue: "resultRows",
          rowMode: "array",
        }) as unknown[][]
      ).map(([id, data]) => ({
        id: typeof id === "string" && id !== "" ? id : null,
        label: parseStoredFiscalPeriodLabel(data),
      }));
    } finally {
      database.close();
    }
  } catch {
    return [];
  }
}

export async function createBookFileBytes(
  snapshot: DbSnapshot,
  lastChangedAt: number | null,
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
    if (lastChangedAt != null) {
      database.exec({
        sql: RESTORE_LAST_CHANGED_AT_SQL,
        bind: [String(lastChangedAt)],
      });
    }
    return sqlite3.capi.sqlite3_js_db_export(database.pointer!);
  } finally {
    database.close();
  }
}

export async function rebuildBookFileBytes(
  records: BookPeriodRecords,
  lastChangedAt: number | null,
): Promise<Uint8Array> {
  const bytes = await createBookFileBytes(
    {
      fiscalPeriods: [records.fiscalPeriod],
      entries: records.entries,
      fixedAssets: records.fixedAssets,
    },
    lastChangedAt,
  );
  const rebuilt = await createBookDbAdapter(bytes);
  try {
    const sameStamp =
      lastChangedAt == null || rebuilt.lastChangedAt() === lastChangedAt;
    const sameRecords =
      JSON.stringify(await readBookRecords(rebuilt)) ===
      JSON.stringify([records]);
    if (rebuilt.changedOnOpen || !sameStamp || !sameRecords) {
      throw new BookFileFormatError(
        "invalid_content",
        `the rebuilt book does not match its source: ${records.fiscalPeriod.id}`,
      );
    }
    return bytes;
  } finally {
    rebuilt.close();
  }
}

function readStoredLastChangedAt(database: {
  selectValue(sql: string): unknown;
}): number | null {
  const stored = database.selectValue(LAST_CHANGED_AT_QUERY);
  if (stored == null) return null;
  const stamp = parseLastChangedAt(stored);
  if (stamp == null || stamp > LARGEST_LAST_CHANGED_AT_IN_A_BOOK_FILE) {
    throw new BookFileFormatError(
      "invalid_content",
      `book change stamp cannot be used: ${String(stored)}`,
    );
  }
  return stamp;
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
