import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@rubydogjp/openkk-sqlite-adapter";

import {
  createDocumentDbAdapter,
  DocumentFileFormatError,
  type DocumentDbAdapter,
} from "./index.js";
import { createNodeSqliteDbAdapter } from "../../node-sqlite-db-adapter/src/index.js";
import { runDbPortConformance } from "../../server-ports/test-support/db-port-conformance.js";

const openAdapters: DocumentDbAdapter[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function open(bytes: Uint8Array | null): Promise<DocumentDbAdapter> {
  const adapter = await createDocumentDbAdapter(bytes);
  openAdapters.push(adapter);
  return adapter;
}

async function seededBytes(
  seed: Parameters<typeof createNodeSqliteDbAdapter>[1],
): Promise<Uint8Array> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "seed.openkk");
  (await createNodeSqliteDbAdapter(filePath, seed)).close();
  return new Uint8Array(fs.readFileSync(filePath));
}

runDbPortConformance("document-db-adapter", {
  makeAdapter: async () => (await open(null)).db,
  makeSeededAdapter: async (seed) => (await open(await seededBytes(seed))).db,
});

const period = {
  name: "2026年分",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

describe("document-db-adapter", () => {
  it("round-trips a book through exported bytes", async () => {
    const first = await open(null);
    const created = await first.db.fiscalPeriods.create("user-1", period);

    const reopened = await open(first.exportBytes());

    expect(await reopened.db.fiscalPeriods.getById(created.id)).toEqual(
      created,
    );
    expect(reopened.changedOnOpen).toBe(false);
  });

  it("opens a book file written by the CLI and writes back bytes it can read", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "book.openkk");
    const cli = await createNodeSqliteDbAdapter(filePath, null);
    const fromCli = await cli.db.fiscalPeriods.create("user-1", period);
    cli.close();

    const document = await open(new Uint8Array(fs.readFileSync(filePath)));
    const fromBrowser = await document.db.fiscalPeriods.create("user-1", {
      ...period,
      name: "2027年分",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });
    fs.writeFileSync(filePath, document.exportBytes());
    const cliAgain = await createNodeSqliteDbAdapter(filePath, null);
    const names = (await cliAgain.db.fiscalPeriods.getAll("user-1")).map(
      (record) => record.name,
    );
    cliAgain.close();

    expect(await document.db.fiscalPeriods.getById(fromCli.id)).toEqual(
      fromCli,
    );
    expect([...names].sort()).toEqual(["2026年分", fromBrowser.name]);
  });

  it("notifies listeners only after operations that change the book", async () => {
    const document = await open(null);
    let notifications = 0;
    const unsubscribe = document.onChange(() => {
      notifications += 1;
    });

    await document.db.fiscalPeriods.getAll("user-1");
    await document.db.masterData.getBookAccounts();
    const created = await document.db.fiscalPeriods.create("user-1", period);
    await document.db.fiscalPeriods.getById(created.id);
    await document.db.fiscalPeriods.start(created.id);
    await expect(document.db.fiscalPeriods.start(created.id)).rejects.toThrow();
    unsubscribe();
    await document.db.fiscalPeriods.patch(created.id, {
      openingBalancesCompleted: true,
    });

    expect(notifications).toBe(2);
  });

  it("marks a new book as changed so the host writes it once", async () => {
    expect((await open(null)).changedOnOpen).toBe(true);
  });

  it("rejects bytes that are not a SQLite database", async () => {
    await expect(
      createDocumentDbAdapter(new TextEncoder().encode("hello, world")),
    ).rejects.toMatchObject({ problem: "not_sqlite" });
  });

  it("rejects a SQLite database that is not an openkk book", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "other.sqlite3");
    const other = new DatabaseSync(filePath);
    other.exec("CREATE TABLE notes (body TEXT)");
    other.close();

    const error = await createDocumentDbAdapter(
      new Uint8Array(fs.readFileSync(filePath)),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DocumentFileFormatError);
    expect(error).toMatchObject({ problem: "not_openkk" });
  });

  it("refuses a book written by a newer schema", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openkk-document-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "newer.openkk");
    (await createNodeSqliteDbAdapter(filePath, null)).close();
    const raw = new DatabaseSync(filePath);
    raw
      .prepare("UPDATE openkk_meta SET value = ? WHERE key = 'schema_version'")
      .run(String(SCHEMA_VERSION + 1));
    raw.close();

    await expect(
      createDocumentDbAdapter(new Uint8Array(fs.readFileSync(filePath))),
    ).rejects.toMatchObject({ problem: "newer_schema" });
  });
});
