import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@rubydogjp/openkk-sqlite-db-adapter";

import {
  createDiskDbAdapter,
  IN_MEMORY_SQLITE_PATH,
  type DiskDbAdapter,
} from "./index.js";
import { runDbPortConformance } from "../../engine/test-support/db-port-conformance.js";

const openAdapters: DiskDbAdapter[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-node-sqlite-"));
  tempDirs.push(dir);
  return path.join(dir, "openkk.sqlite3");
}

async function open(
  dbPath: string,
  seed: Parameters<typeof createDiskDbAdapter>[1],
) {
  const adapter = await createDiskDbAdapter(dbPath, seed);
  openAdapters.push(adapter);
  return adapter.db;
}

runDbPortConformance("node-sqlite-db-adapter (memory)", {
  makeAdapter: () => open(IN_MEMORY_SQLITE_PATH, null),
  makeSeededAdapter: (seed) => open(IN_MEMORY_SQLITE_PATH, seed),
});

runDbPortConformance("node-sqlite-db-adapter (file)", {
  makeAdapter: () => open(tempDbPath(), null),
  makeSeededAdapter: (seed) => open(tempDbPath(), seed),
});

describe("node-sqlite-db-adapter file persistence", () => {
  it("keeps data after the file is closed and reopened", async () => {
    const dbPath = tempDbPath();
    const first = await createDiskDbAdapter(dbPath, null);
    const created = await first.db.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    first.close();

    const reopened = await open(dbPath, null);

    expect(await reopened.fiscalPeriods.getById(created.id)).toEqual(created);
  });

  it("refuses a file written by a newer schema", async () => {
    const dbPath = tempDbPath();
    (await createDiskDbAdapter(dbPath, null)).close();
    const raw = new DatabaseSync(dbPath);
    raw
      .prepare("UPDATE openkk_meta SET value = ? WHERE key = 'schema_version'")
      .run(String(SCHEMA_VERSION + 1));
    raw.close();

    await expect(createDiskDbAdapter(dbPath, null)).rejects.toThrow(
      /newer than app SCHEMA_VERSION/,
    );
  });

  it("refuses a SQLite file that is not an openkk book and leaves it as it was", async () => {
    const dbPath = tempDbPath();
    const other = new DatabaseSync(dbPath);
    other.exec("CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT)");
    other.exec("INSERT INTO notes(body) VALUES('not a book')");
    other.close();
    const before = fs.readFileSync(dbPath);

    await expect(createDiskDbAdapter(dbPath, null)).rejects.toMatchObject({
      statusCode: 400,
      messageForUser: "このファイルはオープン会計の帳簿ではありません",
    });

    expect(fs.readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("makes a new book in a file that does not exist yet or is empty", async () => {
    const missingPath = tempDbPath();
    const emptyPath = tempDbPath();
    fs.writeFileSync(emptyPath, new Uint8Array(0));

    for (const dbPath of [missingPath, emptyPath]) {
      const db = await open(dbPath, null);
      expect(await db.fiscalPeriods.getAll("user-1")).toEqual([]);
    }
  });

  it("does not rewrite a book that is only opened and read", async () => {
    const dbPath = tempDbPath();
    const first = await createDiskDbAdapter(dbPath, null);
    const created = await first.db.fiscalPeriods.create("user-1", {
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    first.close();
    const before = fs.readFileSync(dbPath);

    const reopened = await createDiskDbAdapter(dbPath, null);
    await reopened.db.fiscalPeriods.getAll("user-1");
    await reopened.db.entries.getAll(created.id);
    await reopened.db.fixedAssets.getAll(created.id);
    reopened.close();

    expect(fs.readFileSync(dbPath).equals(before)).toBe(true);
    expect(fs.readdirSync(path.dirname(dbPath))).toEqual([
      path.basename(dbPath),
    ]);
  });
});
