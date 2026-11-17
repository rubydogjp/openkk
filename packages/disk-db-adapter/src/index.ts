import { DatabaseSync, type StatementSync } from "node:sqlite";
import {
  engineConflictError,
  engineValidationError,
  type DbSnapshot,
  type OpenkkDbPort,
} from "@rubydogjp/openkk-engine";
import {
  createSqliteDbAdapter,
  runMigrations,
  SCHEMA_VERSION,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-db-adapter";

export { type DbSnapshot } from "@rubydogjp/openkk-engine";

export const IN_MEMORY_SQLITE_PATH = ":memory:";

export type DiskDbAdapter = {
  db: OpenkkDbPort;
  close(): void;
};

const META_TABLE_QUERY =
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='openkk_meta'";
const ANY_TABLE_QUERY = "SELECT 1 FROM sqlite_master WHERE type='table'";
const SCHEMA_VERSION_QUERY =
  "SELECT value FROM openkk_meta WHERE key = 'schema_version'";
const BUSY_TIMEOUT_MS = 3000;
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_READONLY = 8;
const SQLITE_FULL = 13;
const SQLITE_CANTOPEN = 14;
const SQLITE_NOTADB = 26;
const NOT_A_BOOK_MESSAGE = "このファイルはオープン会計の帳簿ではありません";

type SqlValue = null | number | bigint | string | Uint8Array;

type ExecOptions = {
  sql: string;
  bind?: unknown[];
  returnValue?: string;
  rowMode?: string;
};

export async function createDiskDbAdapter(
  path: string,
  seed: DbSnapshot | null,
): Promise<DiskDbAdapter> {
  const database = openDatabase(path);
  try {
    const connection = createNodeSqliteConnection(database, path);
    assertOpenkkBookOrEmpty(connection, path);
    assertNotNewerSchema(connection, path);
    runMigrations(connection);
    const sqlDb: SqlDb = { exec: async (arg) => connection.exec(arg) };
    const db = await createSqliteDbAdapter(sqlDb, seed);
    return { db, close: () => database.close() };
  } catch (error) {
    database.close();
    throw error;
  }
}

function openDatabase(path: string): DatabaseSync {
  try {
    return new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });
  } catch (error) {
    throw translateSqliteError(error, path);
  }
}

function sqliteErrorCode(error: unknown): number | null {
  if (error == null || typeof error !== "object" || !("errcode" in error)) {
    return null;
  }
  return typeof error.errcode === "number" ? error.errcode & 0xff : null;
}

function translateSqliteError(error: unknown, path: string): unknown {
  const code = sqliteErrorCode(error);
  const detail = error instanceof Error ? error.message : String(error);
  if (code === SQLITE_BUSY || code === SQLITE_LOCKED) {
    return engineConflictError(
      `SQLite file is busy: ${path}: ${detail}`,
      "帳簿ファイルをほかのプログラムが使っています。少し待ってからやり直してください",
    );
  }
  if (code === SQLITE_READONLY) {
    return engineConflictError(
      `SQLite file is read-only: ${path}: ${detail}`,
      `帳簿ファイルに書き込めません。読み取り専用になっていないか確かめてください: ${path}`,
    );
  }
  if (code === SQLITE_FULL) {
    return engineConflictError(
      `Disk is full: ${path}: ${detail}`,
      `ディスクの空きが足りないので帳簿ファイルに書き込めません: ${path}`,
    );
  }
  if (code === SQLITE_CANTOPEN) {
    return engineValidationError(
      `SQLite file cannot be opened: ${path}: ${detail}`,
      `帳簿ファイルを開けませんでした。フォルダがあるか確かめてください: ${path}`,
    );
  }
  if (code === SQLITE_NOTADB) {
    return engineValidationError(
      `File is not a SQLite database: ${path}: ${detail}`,
      NOT_A_BOOK_MESSAGE,
    );
  }
  return error;
}

function assertNotNewerSchema(
  connection: { selectValue(sql: string): unknown },
  path: string,
): void {
  if (connection.selectValue(META_TABLE_QUERY) == null) return;
  const stored = Number(connection.selectValue(SCHEMA_VERSION_QUERY));
  if (Number.isInteger(stored) && stored > SCHEMA_VERSION) {
    throw engineValidationError(
      `schema_version ${stored} is newer than app SCHEMA_VERSION ${SCHEMA_VERSION}: ${path}`,
      "この帳簿は新しい版のオープン会計で作られています。openkk を更新してください",
    );
  }
}

function assertOpenkkBookOrEmpty(
  connection: { selectValue(sql: string): unknown },
  path: string,
): void {
  if (connection.selectValue(META_TABLE_QUERY) != null) return;
  if (connection.selectValue(ANY_TABLE_QUERY) == null) return;
  throw engineValidationError(
    `SQLite file is not an openkk book: ${path}`,
    NOT_A_BOOK_MESSAGE,
  );
}

function createNodeSqliteConnection(database: DatabaseSync, path: string) {
  const translated = <Result>(run: () => Result): Result => {
    try {
      return run();
    } catch (error) {
      throw translateSqliteError(error, path);
    }
  };
  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    const cached = statements.get(sql);
    if (cached != null) return cached;
    const statement = database.prepare(sql);
    statements.set(sql, statement);
    return statement;
  };

  return {
    exec(...args: unknown[]): unknown {
      return translated(() => {
        const [arg] = args;
        if (typeof arg === "string") {
          database.exec(arg);
          return undefined;
        }
        const options = arg as ExecOptions;
        const statement = prepare(options.sql);
        const params = (options.bind ?? []).map(toSqlValue);
        if (options.returnValue === "resultRows") {
          statement.setReturnArrays(options.rowMode === "array");
          return statement.all(...params);
        }
        statement.run(...params);
        return undefined;
      });
    },
    selectValue(sql: string): unknown {
      return translated(() => {
        const statement = prepare(sql);
        statement.setReturnArrays(true);
        const row = statement.get() as unknown[] | undefined;
        return row?.[0];
      });
    },
  };
}

function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
}
