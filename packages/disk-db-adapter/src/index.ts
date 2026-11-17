import { DatabaseSync, type StatementSync } from "node:sqlite";
import {
  engineValidationError,
  type DbSnapshot,
  type OpenkkDbPort,
} from "@rubydogjp/openkk-engine";
import {
  createSqliteDbAdapter,
  runMigrations,
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
  const database = new DatabaseSync(path);
  try {
    const connection = createNodeSqliteConnection(database);
    assertOpenkkBookOrEmpty(connection, path);
    runMigrations(connection);
    const sqlDb: SqlDb = { exec: async (arg) => connection.exec(arg) };
    const db = await createSqliteDbAdapter(sqlDb, seed);
    return { db, close: () => database.close() };
  } catch (error) {
    database.close();
    throw error;
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
    "このファイルはオープン会計の帳簿ではありません",
  );
}

function createNodeSqliteConnection(database: DatabaseSync) {
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
    },
    selectValue(sql: string): unknown {
      const statement = prepare(sql);
      statement.setReturnArrays(true);
      const row = statement.get() as unknown[] | undefined;
      return row?.[0];
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
