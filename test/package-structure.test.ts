import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-sqlite-adapter";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(rootDir, "packages");
const rootLicense = fs.readFileSync(path.join(rootDir, "LICENSE"), "utf8");

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
  it("loads every published JavaScript entry point in Node.js", () => {
    const entries = packageRecords
      .filter((record) => !APP_DIRS.has(record.packageDir))
      .flatMap(({ packageJson }) =>
        Object.entries(packageJson.exports)
          .filter(([, target]) => typeof target === "object")
          .map(([subpath]) =>
            packageJson.name + (subpath === "." ? "" : subpath.slice(1)),
          ),
      );
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "for (const entry of process.argv.slice(1)) await import(entry);",
        ...entries,
      ],
      { cwd: rootDir, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
  });

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
      expect(record.packageJson.license).toBe(rootPackageJson.license);
      expect(record.packageJson.publishConfig).toEqual({ access: "public" });
      expect(fs.readFileSync(path.join(record.dir, "LICENSE"), "utf8")).toBe(
        rootLicense,
      );
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

  it("keeps relative imports extension-qualified in library packages", () => {
    const offenders: string[] = [];

    for (const record of packageRecords.filter(
      (item) => !APP_DIRS.has(item.packageDir),
    )) {
      for (const file of sourceFiles(path.join(record.dir, "src"))) {
        const source = fs.readFileSync(file, "utf8");
        const specifiers = source.matchAll(
          /(?:from\s*|import\s*\(\s*|^\s*import\s+)(["'])(\.\.?\/[^"']*)\1/gm,
        );
        for (const match of specifiers) {
          const specifier = match[2]!;
          if (!/\.(js|json|css)$/.test(specifier)) {
            offenders.push(`${path.relative(rootDir, file)}: ${specifier}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
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
      const internalImports = findInternalImports(record.dir, false);
      const declared = new Set([
        ...Object.keys(record.packageJson.dependencies ?? {}),
        ...Object.keys(record.packageJson.peerDependencies ?? {}),
        ...Object.keys(record.packageJson.devDependencies ?? {}),
      ]);
      for (const importedPackage of internalImports) {
        expect(importedPackage).not.toBe(record.packageJson.name);
        expect(packageNameToDir.has(importedPackage)).toBe(true);
        expect(declared.has(importedPackage)).toBe(true);
      }
    }
  });

  it("keeps production imports within declared layer dependencies", () => {
    const allowedLayers: Record<string, string[]> = {
      "client-domain": [],
      "client-ports": ["client-domain"],
      "client-usecases": ["client-domain", "client-ports"],
      "client-ui": ["client-domain", "client-usecases"],
      client: ["client-domain", "client-ports", "client-usecases", "client-ui"],
      "server-domain": [],
      "server-ports": ["server-domain"],
      "server-usecases": ["server-domain", "server-ports"],
      "server-api": ["server-domain", "server-ports", "server-usecases"],
      server: [
        "server-domain",
        "server-ports",
        "server-usecases",
        "server-api",
      ],
      "sqlite-adapter": ["server-domain", "server-ports"],
      "file-db-adapter": ["server-ports", "sqlite-adapter"],
      "memory-db-adapter": ["server-ports", "sqlite-adapter"],
      "embedded-backend": ["server"],
      "embedded-backend-adapter": ["client-ports", "embedded-backend"],
      "print-adapter": ["client-ports"],
      frontend: ["client", "print-adapter"],
      openkk: [
        "client",
        "frontend",
        "embedded-backend",
        "embedded-backend-adapter",
        "file-db-adapter",
      ],
      openkk_sim: [
        "client",
        "frontend",
        "embedded-backend",
        "embedded-backend-adapter",
        "memory-db-adapter",
      ],
      openkk_demo: [
        "client",
        "frontend",
        "embedded-backend",
        "embedded-backend-adapter",
        "memory-db-adapter",
      ],
    };
    expect(Object.keys(allowedLayers).sort()).toEqual(packageDirs);
    for (const record of packageRecords) {
      const allowed = new Set(
        allowedLayers[record.packageDir]!.map(packageName),
      );
      const declared = new Set([
        ...Object.keys(record.packageJson.dependencies ?? {}),
        ...Object.keys(record.packageJson.peerDependencies ?? {}),
      ]);
      for (const dependency of declared) {
        if (packageNameToDir.has(dependency)) {
          expect(
            allowed.has(dependency),
            record.packageDir + " -> " + dependency,
          ).toBe(true);
        }
      }
      for (const dependency of findInternalImports(record.dir, true)) {
        expect(
          declared.has(dependency),
          record.packageDir + " -> " + dependency,
        ).toBe(true);
        expect(
          allowed.has(dependency),
          record.packageDir + " -> " + dependency,
        ).toBe(true);
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
      "sqlite-adapter",
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
      const internalImports = findInternalImports(record.dir, true);
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
    const restBoundaryName =
      /(?:Request|Response|ApiRecord|Input|ApiErrorDto)$/;
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
    const restBoundaryName =
      /(?:Request|Response|ApiRecord|Input|ApiErrorDto)$/;
    const sharedApiInterfaces = [
      "AuthApi",
      "PreClosingsApi",
      "ClosingsApi",
      "EntriesApi",
      "FiscalPeriodsApi",
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
    const dbPort = fs.readFileSync(
      path.join(packagesDir, "server-ports/src/db-port.ts"),
      "utf8",
    );
    const sqliteAdapter = fs.readFileSync(
      path.join(packagesDir, "sqlite-adapter/src/adapter.ts"),
      "utf8",
    );

    expect(persistenceTypes).not.toMatch(/Api(?:Record|Request|Response)/);
    expect(dbPort).toContain('from "./persistence-types.js"');
    expect(sqliteAdapter).not.toMatch(/ApiRecord/);
  });

  it("documents exactly the migrated SQLite tables", async () => {
    const sqlite3 = await sqlite3InitModule({
      print: () => undefined,
      printErr: () => undefined,
    });
    const db = new sqlite3.oo1.DB(":memory:");
    runMigrations(db);
    const tables = db.selectValues(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const schemaDoc = fs.readFileSync(
      path.join(rootDir, "docs/database-schema.md"),
      "utf8",
    );
    const documented = [...schemaDoc.matchAll(/^  ([a-z0-9_]+) \{$/gm)]
      .map((match) => match[1]!)
      .sort();

    expect(documented).toEqual(tables);
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

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function findInternalImports(
  packageDir: string,
  productionOnly: boolean,
): Set<string> {
  const out = new Set<string>();
  for (const file of listFiles(packageDir)) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(file)) continue;
    if (
      productionOnly &&
      (/\.test\.tsx?$/.test(file) || file.includes("/test-support/"))
    )
      continue;
    const text = fs.readFileSync(file, "utf8");
    function add(specifier: string): void {
      if (productionOnly && specifier.startsWith(".")) {
        const target = path.resolve(path.dirname(file), specifier);
        expect(
          target.startsWith(packageDir + path.sep),
          file + ": " + specifier,
        ).toBe(true);
      }
      const bare = specifier.match(
        /^(@rubydogjp\/openkk(?:-[a-z0-9-]+)?)(?:\/|$)/,
      )?.[1];
      if (bare != null) out.add(bare);
    }
    if (file.endsWith(".css")) {
      for (const match of text.matchAll(/@import\s+["']([^"']+)["']/g))
        add(match[1]!);
      continue;
    }
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier != null &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        add(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] != null &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
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

const LEADING_UNION_PIPE = /([:=(<{,])\|/g;
const TRAILING_SEMICOLON = /;(\}|$)/g;
const TRAILING_COMMA = /,(\)|\}|>|\]|$)/g;

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
      .replace(LEADING_UNION_PIPE, "$1")
      .replace(TRAILING_SEMICOLON, "$1")
      .replace(TRAILING_COMMA, "$1");
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
