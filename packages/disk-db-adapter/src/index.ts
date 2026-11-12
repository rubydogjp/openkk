import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { DbSnapshot, OpenkkDbPort } from "@rubydogjp/openkk-engine";
import {
  createSqliteDbAdapter,
  runMigrations,
  type SqlDb,
} from "@rubydogjp/openkk-sqlite-db-adapter";

export { type DbSnapshot } from "@rubydogjp/openkk-engine";

export const IN_MEMORY_SQLITE_PATH = ":memory:";

export type NodeSqliteDbAdapter = {
  db: OpenkkDbPort;
  close(): void;
};

type SqlValue = null | number | bigint | string | Uint8Array;

type ExecOptions = {
  sql: string;
  bind?: unknown[];
  returnValue?: string;
  rowMode?: string;
};

export async function createNodeSqliteDbAdapter(
  path: string,
  seed: DbSnapshot | null,
): Promise<NodeSqliteDbAdapter> {
  const database = new DatabaseSync(path);
  try {
    const connection = createNodeSqliteConnection(database);
    runMigrations(connection);
    const sqlDb: SqlDb = { exec: async (arg) => connection.exec(arg) };
    const db = await createSqliteDbAdapter(sqlDb, seed);
    return { db, close: () => database.close() };
  } catch (error) {
    database.close();
    throw error;
  }
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
