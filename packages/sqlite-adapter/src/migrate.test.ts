import { describe, expect, it } from "vitest";

import { runMigrations, type MigrationDb } from "./migrate.js";
import { SCHEMA_MIGRATIONS, SCHEMA_VERSION } from "./schema.js";

describe("SQLite schema", () => {
  it("keeps the normalized schema at version 4", () => {
    expect(SCHEMA_VERSION).toBe(4);
  });

  it("keeps migration versions unique, ordered, and contiguous", () => {
    const versions = SCHEMA_MIGRATIONS.map(({ version }) => version);
    expect(versions).toEqual(versions.map((_, index) => index + 1));
  });
});

type FakeMeta = { schemaVersion: number | string | null; metaTableExists: boolean };

function createFakeDb(initial: Partial<FakeMeta> = {}): {
  db: MigrationDb;
  state: FakeMeta;
  execLog: Array<string | { sql: string; bind?: unknown[] }>;
  setExecError: (err: Error | null) => void;
  setRollbackError: (err: Error | null) => void;
} {
  const state: FakeMeta = {
    metaTableExists: initial.metaTableExists ?? false,
    schemaVersion: initial.schemaVersion ?? null,
  };
  const execLog: Array<string | { sql: string; bind?: unknown[] }> = [];
  let pendingError: Error | null = null;
  let rollbackError: Error | null = null;

  const db: MigrationDb = {
    selectValue(sql) {
      if (sql.includes("FROM sqlite_master") && sql.includes("openkk_meta")) {
        return state.metaTableExists ? 1 : null;
      }
      if (sql.includes("FROM openkk_meta") && sql.includes("schema_version")) {
        return state.schemaVersion == null ? null : String(state.schemaVersion);
      }
      throw new Error(`unexpected selectValue: ${sql}`);
    },
    exec(arg: string | { sql: string; bind?: unknown[] }) {
      execLog.push(arg);
      const sql = typeof arg === "string" ? arg : arg.sql;
      if (sql === "ROLLBACK" && rollbackError != null) {
        throw rollbackError;
      }
      if (pendingError != null && sql !== "BEGIN" && sql !== "ROLLBACK") {
        throw pendingError;
      }

      if (
        typeof arg === "object" &&
        arg.sql.includes("INSERT OR REPLACE INTO openkk_meta")
      ) {
        const version = Number.parseInt(String(arg.bind?.[0] ?? "0"), 10);
        state.schemaVersion = version;
        state.metaTableExists = true;
      }
    },
  };

  return {
    db,
    state,
    execLog,
    setExecError(err) {
      pendingError = err;
    },
    setRollbackError(err) {
      rollbackError = err;
    },
  };
}

describe("runMigrations", () => {
  it("applies all migrations on a fresh DB (version 0 → SCHEMA_VERSION)", () => {
    const { db, state, execLog } = createFakeDb({ metaTableExists: false });
    runMigrations(db);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);

    const beginCount = execLog.filter((e) => e === "BEGIN").length;
    const commitCount = execLog.filter((e) => e === "COMMIT").length;
    expect(beginCount).toBe(SCHEMA_VERSION);
    expect(commitCount).toBe(SCHEMA_VERSION);
  });

  it("is a no-op when current version already matches", () => {
    const { db, execLog } = createFakeDb({
      metaTableExists: true,
      schemaVersion: SCHEMA_VERSION,
    });
    runMigrations(db);
    expect(execLog).toEqual([]);
  });

  it("throws when DB version is newer than app (refuses downgrade)", () => {
    const { db, execLog } = createFakeDb({
      metaTableExists: true,
      schemaVersion: SCHEMA_VERSION + 1,
    });
    expect(() => runMigrations(db)).toThrow(/newer than app SCHEMA_VERSION/);
    expect(execLog).toEqual([]);
  });

  it("rolls back and surfaces error when migration SQL fails", () => {
    const { db, setExecError, execLog, state } = createFakeDb({
      metaTableExists: false,
    });
    setExecError(new Error("syntax error near 'WHATEVER'"));
    expect(() => runMigrations(db)).toThrow(/migration to version 1 failed/);

    expect(execLog[0]).toBe("BEGIN");
    expect(execLog).toContain("ROLLBACK");
    expect(state.schemaVersion).toBeNull();
  });

  it("retains the migration failure when rollback also fails", () => {
    const { db, setExecError, setRollbackError } = createFakeDb({
      metaTableExists: false,
    });
    const migrationError = new Error("migration write failed");
    const rollbackError = new Error("rollback failed");
    setExecError(migrationError);
    setRollbackError(rollbackError);

    let thrown: unknown;
    try {
      runMigrations(db);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const combined = (thrown as Error).cause;
    expect(combined).toBeInstanceOf(AggregateError);
    expect((combined as AggregateError).cause).toBe(migrationError);
    expect((combined as AggregateError).errors).toEqual([
      migrationError,
      rollbackError,
    ]);
  });

  it("reads schema_version=0 when meta table is missing", () => {
    const { db, state } = createFakeDb({ metaTableExists: false });
    runMigrations(db);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("reads schema_version=0 when meta table exists but row is missing", () => {
    const { db, state } = createFakeDb({
      metaTableExists: true,
      schemaVersion: null,
    });
    runMigrations(db);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects a malformed schema version instead of treating it as a fresh DB", () => {
    const { db, execLog } = createFakeDb({
      metaTableExists: true,
      schemaVersion: "1broken",
    });
    expect(() => runMigrations(db)).toThrow(/invalid schema_version/);
    expect(execLog).toEqual([]);
  });
});
