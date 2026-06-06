import { SCHEMA_MIGRATIONS, SCHEMA_VERSION } from "./schema";

export type MigrationDb = {
  selectValue(sql: string): unknown;
  exec(...args: unknown[]): unknown;
};

export function runMigrations(db: MigrationDb): void {
  const currentVersion = readSchemaVersion(db);
  if (currentVersion === SCHEMA_VERSION) {
    return;
  }
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `[openkk-browser-db] schema_version ${currentVersion} is newer than app SCHEMA_VERSION ${SCHEMA_VERSION}; refusing to downgrade. Update the app or clear OPFS storage.`,
    );
  }

  const pending = SCHEMA_MIGRATIONS.filter((m) => m.version > currentVersion);
  for (const migration of pending) {
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.exec({
        sql: `INSERT OR REPLACE INTO openkk_meta(key, value) VALUES('schema_version', ?)`,
        bind: [String(migration.version)],
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `[openkk-browser-db] migration to version ${migration.version} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function readSchemaVersion(db: MigrationDb): number {
  const tableExists = db.selectValue(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='openkk_meta'",
  );
  if (tableExists == null) {
    return 0;
  }
  const raw = db.selectValue(
    "SELECT value FROM openkk_meta WHERE key='schema_version'",
  );
  if (raw == null) {
    return 0;
  }
  const text = String(raw);
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    throw new Error(
      `[openkk-browser-db] invalid schema_version: ${JSON.stringify(text)}`,
    );
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `[openkk-browser-db] schema_version is outside the safe integer range: ${text}`,
    );
  }
  return parsed;
}
