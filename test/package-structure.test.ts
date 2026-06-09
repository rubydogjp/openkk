import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(rootDir, "packages");

const APP_DIRS = new Set(["openkk", "openkk_sim", "openkk_demo"]);
const rootPackageJson = readJson(path.join(rootDir, "package.json"));
const workspaceNames = rootPackageJson.workspaces.map((workspace: string) =>
  workspace.replace(/^packages\//, ""),
);
const packageDirs = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const packageRecords = packageDirs.map((packageDir) => {
  const dir = path.join(packagesDir, packageDir);
  const packageJson = readJson(path.join(dir, "package.json"));
  const tsconfig = readJson(path.join(dir, "tsconfig.json"));
  return { packageDir, dir, packageJson, tsconfig };
});

const packageNameToDir = new Map(
  packageRecords.map((record) => [record.packageJson.name, record.packageDir]),
);

describe("openkk workspace structure", () => {
  it("keeps package directories and root workspaces in sync", () => {
    expect(workspaceNames.sort()).toEqual(packageDirs);
  });

  it("keeps library packages on the same public entry shape", () => {
    for (const record of packageRecords.filter(
      (item) => !APP_DIRS.has(item.packageDir),
    )) {
      expect(record.packageJson.name).toBe(packageName(record.packageDir));
      expect(record.packageJson.private).toBeUndefined();
      expect(record.packageJson.main).toBe("./dist/index.js");
      expect(record.packageJson.types).toBe("./dist/index.d.ts");
      expect(record.packageJson.exports["."]).toEqual({
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      });
      expect(record.packageJson.files).toEqual(["dist"]);
      expect(record.packageJson.publishConfig).toEqual({ access: "public" });
      expect(record.packageJson.scripts.lint).toBe(
        "tsc -p tsconfig.json --noEmit",
      );
      expect(record.packageJson.scripts.build).toBeDefined();
      expect(fs.existsSync(path.join(record.dir, "src/index.ts"))).toBe(true);
      expect(fs.existsSync(path.join(record.dir, "tsconfig.build.json"))).toBe(
        true,
      );
    }
  });

  it("keeps style subpath exports limited to client packages", () => {
    for (const record of packageRecords) {
      const styleExport = record.packageJson.exports?.["./styles.css"];
      if (record.packageDir === "client" || record.packageDir === "client-ui") {
        expect(styleExport).toBe("./dist/styles.css");
        expect(fs.existsSync(path.join(record.dir, "src/styles.css"))).toBe(
          true,
        );
      } else if (!APP_DIRS.has(record.packageDir)) {
        expect(styleExport).toBeUndefined();
      }
    }
  });

  it("keeps tsconfig layout predictable", () => {
    for (const record of packageRecords) {
      expect(record.tsconfig.extends).toBe("../../tsconfig.base.json");
      if (APP_DIRS.has(record.packageDir)) {
        expect(record.tsconfig.compilerOptions.jsx).toBe("preserve");
        expect(record.tsconfig.include).toContain("**/*.tsx");
      } else {
        expect(record.tsconfig.include).toEqual([
          "src/**/*.ts",
          "src/**/*.tsx",
        ]);
      }
    }
  });

  it("declares every internal package import and avoids self imports", () => {
    for (const record of packageRecords) {
      const internalImports = findInternalImports(record.dir);
      const declared = new Set([
        ...Object.keys(record.packageJson.dependencies ?? {}),
        ...Object.keys(record.packageJson.peerDependencies ?? {}),
      ]);
      for (const importedPackage of internalImports) {
        expect(importedPackage).not.toBe(record.packageJson.name);
        expect(packageNameToDir.has(importedPackage)).toBe(true);
        expect(declared.has(importedPackage)).toBe(true);
      }
    }
  });

  it("apps consume client-* / server-* only via the meta barrels", () => {
    const CLIENT_SUBPACKAGES = [
      "@rubydogjp/openkk-client-domain",
      "@rubydogjp/openkk-client-ports",
      "@rubydogjp/openkk-client-usecases",
      "@rubydogjp/openkk-client-ui",
    ];
    const SERVER_SUBPACKAGES = [
      "@rubydogjp/openkk-server-domain",
      "@rubydogjp/openkk-server-ports",
      "@rubydogjp/openkk-server-usecases",
      "@rubydogjp/openkk-server-api",
    ];
    const ADAPTER_EXEMPTIONS = new Set([
      "embedded-backend-adapter",
      "print-adapter",
      "file-db-adapter",
      "memory-db-adapter",
    ]);
    for (const record of packageRecords) {
      if (ADAPTER_EXEMPTIONS.has(record.packageDir)) continue;
      if (record.packageDir === "client" || record.packageDir === "server") {
        continue;
      }
      const isClientLayer = record.packageDir.startsWith("client-");
      const isServerLayer = record.packageDir.startsWith("server-");
      const forbidden = new Set<string>([
        ...(isClientLayer ? [] : CLIENT_SUBPACKAGES),
        ...(isServerLayer ? [] : SERVER_SUBPACKAGES),
      ]);
      const internalImports = findInternalImports(record.dir);
      for (const importedPackage of internalImports) {
        expect(
          forbidden.has(importedPackage),
          `${record.packageJson.name} must not import ${importedPackage} directly — use the @rubydogjp/openkk-client or @rubydogjp/openkk-server meta barrel instead`,
        ).toBe(false);
      }
    }
  });

  it("keeps client/server REST boundary type names in sync", () => {
    const clientTypes = exportedTypeNames(
      path.join(packagesDir, "client-ports/src/backend-api/types.ts"),
    );
    const serverTypes = exportedTypeNames(
      path.join(packagesDir, "server-ports/src/types.ts"),
    );
    const restBoundaryName = /(?:Request|Response|ApiRecord|Input)$/;
    const clientBoundaryTypes = [...clientTypes]
      .filter((name) => restBoundaryName.test(name))
      .sort();
    const serverBoundaryTypes = [...serverTypes]
      .filter((name) => restBoundaryName.test(name))
      .filter((name) => !name.includes("Db"))
      .sort();

    expect(clientBoundaryTypes).toEqual(serverBoundaryTypes);
  });

  it("keeps client/server REST boundary type and interface BODIES in sync", () => {
    const clientBodies = typeBodies(
      path.join(packagesDir, "client-ports/src/backend-api/types.ts"),
    );
    const serverBodies = typeBodies(
      path.join(packagesDir, "server-ports/src/types.ts"),
    );
    const restBoundaryName = /(?:Request|Response|ApiRecord|Input)$/;
    const sharedApiInterfaces = [
      "AuthApi",
      "PreClosingApi",
      "ClosingApi",
      "EntriesApi",
      "FiscalPeriodApi",
      "FixedAssetsApi",
      "MasterDataApi",
    ];
    const namesToCompare = [...clientBodies.keys()].filter(
      (name) =>
        (restBoundaryName.test(name) && !name.includes("Db")) ||
        sharedApiInterfaces.includes(name),
    );
    expect(namesToCompare.length).toBeGreaterThan(0);
    for (const name of namesToCompare) {
      if (!serverBodies.has(name)) continue;
      expect(
        serverBodies.get(name),
        `${name} の本文が client-ports と server-ports で食い違っています`,
      ).toBe(clientBodies.get(name));
    }
  });

  it("keeps client/server HTTP endpoint metadata in sync", () => {
    const clientEndpoints = endpointMetadata(
      path.join(packagesDir, "client-ports/src/backend-api/types.ts"),
    );
    const serverEndpoints = endpointMetadata(
      path.join(packagesDir, "server-ports/src/types.ts"),
    );

    expect(clientEndpoints).toEqual(serverEndpoints);
  });

  it("keeps persistence types independent from REST DTOs", () => {
    const persistenceTypes = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/persistence-types.ts"),
      "utf8",
    );
    const dbAdapter = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/db-adapter.ts"),
      "utf8",
    );
    const sqliteAdapter = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/sqlite/adapter.ts"),
      "utf8",
    );

    expect(persistenceTypes).not.toMatch(/Api(?:Record|Request|Response)/);
    expect(dbAdapter).toContain('from "./persistence-types"');
    expect(sqliteAdapter).not.toMatch(/ApiRecord/);
  });

  it("documents every SQLite table", () => {
    const schema = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/sqlite/schema.ts"),
      "utf8",
    );
    const schemaDoc = fs.readFileSync(
      path.join(rootDir, "docs/database-schema.md"),
      "utf8",
    );
    const tableNamesDeclaration =
      schema.match(/SQLITE_TABLE_NAMES = \[([\s\S]*?)\] as const/)?.[1] ?? "";
    const tables = [...tableNamesDeclaration.matchAll(/"([a-z0-9_]+)"/g)].map(
      (match) => match[1]!,
    );

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(schemaDoc).toContain(`${table} {`);
  });

  it("keeps opening data normalized in SQLite", () => {
    const schema = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/sqlite/schema.ts"),
      "utf8",
    );
    const adapter = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/sqlite/adapter.ts"),
      "utf8",
    );

    expect(schema).toMatch(/json_remove\(data, '\$\.opening'/);
    expect(schema).toContain("json_type(data, '$.opening') IS NULL");
    expect(adapter).toContain("loadOpeningByFiscalPeriod");
    expect(adapter).toContain("replaceOpening");
  });

  it("keeps entry lines normalized in SQLite", () => {
    const schema = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/sqlite/schema.ts"),
      "utf8",
    );
    const adapter = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/sqlite/adapter.ts"),
      "utf8",
    );

    expect(schema).toContain("CREATE TABLE entry_lines");
    expect(schema).not.toContain("json_type(data, '$.lines')");
    expect(adapter).toContain("LEFT JOIN entry_lines");
    expect(adapter).toContain("insertEntryLines");
  });

  it("keeps hard-coded data names aligned with their purpose", () => {
    expect(
      fs.existsSync(
        path.join(packagesDir, "client-domain/src/shared/sample-data.ts"),
      ),
    ).toBe(false);

    const demoSeed = fs.readFileSync(
      path.join(packagesDir, "openkk_demo/demo/demo-seed.ts"),
      "utf8",
    );
    expect(demoSeed).not.toMatch(/\b(sample|example)[A-Za-z0-9_]*/);

    const e2eFixtureNames = fs.readdirSync(path.join(rootDir, "e2e/fixtures"));
    expect(e2eFixtureNames.filter((name) => /sample/i.test(name))).toEqual([]);
  });
});

function packageName(packageDir: string): string {
  return packageDir === "openkk"
    ? "@rubydogjp/openkk"
    : `@rubydogjp/openkk-${packageDir}`;
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function findInternalImports(packageDir: string): Set<string> {
  const out = new Set<string>();
  for (const file of listFiles(packageDir)) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /@rubydogjp\/openkk(?:-[a-z0-9-]+)?(?:\/[a-z0-9./_-]+)?/g,
    )) {
      const bare = match[0].match(/^(@rubydogjp\/openkk(?:-[a-z0-9-]+)?)/)?.[1];
      if (bare != null) out.add(bare);
    }
  }
  return out;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "out" ||
      entry.name === "dist"
    )
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function exportedTypeNames(file: string): Set<string> {
  const text = fs.readFileSync(file, "utf8");
  return new Set(
    [...text.matchAll(/export type ([A-Za-z0-9_]+)/g)].map(
      (match) => match[1]!,
    ),
  );
}

function typeBodies(file: string): Map<string, string> {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const bodies = new Map<string, string>();
  const re = /export (?:type|interface) ([A-Za-z0-9_]+)\s*(?:=\s*)?\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const name = match[1]!;
    let depth = 1;
    let i = re.lastIndex;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    const normalized = text
      .slice(re.lastIndex, i - 1)
      .replace(/\s+/g, "")
      // 先頭ユニオンパイプの整形差（`:|"a"|"b"` と `:"a"|"b"`）を吸収する。
      .replace(/([:=(<{,])\|/g, "$1")
      // 末尾セミコロンの有無（`X;}` と `X}`、行末 `X;`）を吸収する。
      .replace(/;(\}|$)/g, "$1")
      // 末尾カンマの有無（`(a:string,)` と `(a:string)` 等）を吸収する。
      .replace(/,(\)|\}|>|\]|$)/g, "$1");
    bodies.set(name, normalized);
  }
  return bodies;
}

function endpointMetadata(file: string): Array<{
  key: string;
  method: string;
  path: string;
  successStatus: number;
}> {
  const text = fs.readFileSync(file, "utf8");
  return [
    ...text.matchAll(
      /([a-zA-Z0-9]+):\s*\{\s*method:\s*"([A-Z]+)",\s*path:\s*"([^"]+)",\s*successStatus:\s*([0-9]+),?\s*\}/g,
    ),
  ].map((match) => ({
    key: match[1]!,
    method: match[2]!,
    path: match[3]!,
    successStatus: Number(match[4]),
  }));
}
