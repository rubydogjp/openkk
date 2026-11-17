import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readLegacyArchiveZip } from "../packages/driver/src/domain/index.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { createOpenkkBackendApi } from "../packages/backend-api/src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "legacy-fixtures/v26.3.1",
);

type ImportedRecords = {
  fiscalPeriod: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  fixedAssets: Array<Record<string, unknown>>;
};

type ReleaseFixture = {
  madeBy: string;
  userId: string;
  zips: Record<string, ImportedRecords>;
};

const fixture = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, "expected.json"), "utf8"),
) as ReleaseFixture;

const GENERATED_ID =
  /\b[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const IMPORT_TIME_FIELDS = new Set(["createdAt", "updatedAt"]);

function withNumberedIds(records: ImportedRecords): unknown {
  const numbers = new Map<string, string>();
  const numbered = (id: string) => {
    if (!numbers.has(id)) numbers.set(id, `#${numbers.size + 1}`);
    return numbers.get(id)!;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(GENERATED_ID, numbered);
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          IMPORT_TIME_FIELDS.has(key) ? "(import time)" : walk(item),
        ]),
      );
    }
    return value;
  };
  return walk(records);
}

function entryKey(entry: Record<string, unknown>): string {
  return JSON.stringify([entry.date, entry.description, entry.localId]);
}

function inZipOrder(
  records: ImportedRecords,
  zipEntries: ReadonlyArray<Record<string, unknown>>,
): ImportedRecords {
  const order = zipEntries.map(entryKey);
  expect(new Set(order).size).toBe(order.length);
  return {
    ...records,
    entries: [...records.entries].sort(
      (left, right) =>
        order.indexOf(entryKey(left)) - order.indexOf(entryKey(right)),
    ),
  };
}

describe(`archive zips written by ${fixture.madeBy}`, () => {
  it.each(Object.keys(fixture.zips))(
    "%s is imported with the same records the release imported",
    async (name) => {
      const db = await createMemoryDbAdapter(null);
      const backend = createOpenkkBackendApi(db, { userId: fixture.userId });
      const zip = new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, name)));

      const payload = readLegacyArchiveZip(zip);
      const imported = await backend.fiscalPeriods.importArchived(payload);
      const current: ImportedRecords = {
        fiscalPeriod: (await db.fiscalPeriods.getById(imported.id))!,
        entries: await db.entries.getAll(imported.id),
        fixedAssets: await db.fixedAssets.getAll(imported.id),
      };

      expect(withNumberedIds(current)).toEqual(
        withNumberedIds(inZipOrder(fixture.zips[name]!, payload.entries)),
      );
    },
  );
});
