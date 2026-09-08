import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(rootDir, "packages");

const OPTIONAL_DECLARATION = /(^|[ ({,;])[A-Za-z_][A-Za-z0-9_]*\?:/;

/**
 * 外部 API の呼び出し形（sqlite-wasm / worker message / React DOM）を写した型と、
 * 「未指定 = 既定値」を表すテストの上書きファクトリだけが省略可能を許される。
 */
const EXTERNAL_SHAPE_FILES = new Set([
  "client-ui/src/shared/design-tokens.ts",
  "file-db-adapter/src/index.test.ts",
  "file-db-adapter/src/real-db-worker.ts",
  "file-db-adapter/src/sqlite.worker.ts",
  "frontend/src/service-worker.test.ts",
  "server-ports/src/sqlite/migrate.test.ts",
  "server-ports/src/sqlite/sql-db.ts",
]);

const OVERRIDE_FACTORY_FILES = new Set([
  "client-domain/src/entries/import-export.test.ts",
  "server-usecases/src/archive-import.test.ts",
  "server/src/closing-flow.test.ts",
  "server/src/fiscal-period-api.test.ts",
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function hasDefaultValue(lines: string[], name: string): boolean {
  return lines.some(
    (line) =>
      new RegExp(`^\\s{2,}${name} = [^=]`).test(line.replace(/\s+$/, "")) ||
      new RegExp(`[{,]\\s*${name} = [^=]`).test(line),
  );
}

describe("explicit null instead of undefined", () => {
  it("declares no optional properties outside the documented exceptions", () => {
    const offenders: string[] = [];
    for (const packageDir of fs.readdirSync(packagesDir)) {
      for (const subdir of ["src", "app", "demo"]) {
        const dir = path.join(packagesDir, packageDir, subdir);
        if (!fs.existsSync(dir)) continue;
        for (const file of sourceFiles(dir)) {
          const relative = path
            .relative(packagesDir, file)
            .split(path.sep)
            .join("/");
          if (EXTERNAL_SHAPE_FILES.has(relative)) continue;
          if (OVERRIDE_FACTORY_FILES.has(relative)) continue;
          const lines = fs.readFileSync(file, "utf8").split("\n");
          lines.forEach((line, index) => {
            if (!OPTIONAL_DECLARATION.test(line)) return;
            const name = line.match(
              /([A-Za-z_][A-Za-z0-9_]*)\?:/,
            )?.[1] as string;
            if (hasDefaultValue(lines, name)) return;
            offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
          });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
