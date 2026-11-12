import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { runMigrations } from "@rubydogjp/openkk-sqlite-db-adapter";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(rootDir, "packages");
const rootLicense = fs.readFileSync(path.join(rootDir, "LICENSE"), "utf8");

const BOX_KINDS = ["core", "entry", "runtime", "adapter", "bundle"] as const;
type BoxKind = (typeof BOX_KINDS)[number];
const CALLING_SIDE = "calling";
const RECORDING_SIDE = "recording";
const DRIVER_PORTS = ["backend", "print", "platform", "book-files"];
const ENGINE_PORTS = ["db"];
const SAME_PROCESS_BRIDGE_PORTS = ["backend", "book-files"];
const BOXES_AWAITING_SPLIT = new Set(["cli"]);
const PACKAGE_DIRS_RELEASED_TO_NPM = new Set<string>();
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
      .filter((record) => !isBundle(record.packageDir))
      .flatMap(({ packageJson }) =>
        Object.entries(packageJson.exports)
          .filter(([, target]) => typeof target === "object")
          .map(
            ([subpath]) =>
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
      (item) => !isBundle(item.packageDir),
    )) {
      expect(record.packageJson.name).toBe(packageName(record.packageDir));
      expect(record.packageJson.private).toBe(
        PACKAGE_DIRS_RELEASED_TO_NPM.has(record.packageDir) ? undefined : true,
      );
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
      (item) => !isBundle(item.packageDir),
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

  it("keeps the style subpath export limited to frontend-ui", () => {
    for (const record of packageRecords) {
      const styleExport = record.packageJson.exports?.["./styles.css"];
      if (record.packageDir === "frontend-ui") {
        expect(styleExport).toBe("./dist/styles.css");
        expect(fs.existsSync(path.join(record.dir, "src/styles.css"))).toBe(
          true,
        );
      } else if (!isBundle(record.packageDir)) {
        expect(styleExport).toBeUndefined();
      }
    }
  });

  it("keeps tsconfig layout predictable", () => {
    for (const record of packageRecords) {
      expect(record.tsconfig.extends).toBe("../../tsconfig.base.json");
      if (isBundle(record.packageDir)) {
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

  it("names every package after one of the five box kinds", () => {
    for (const packageDir of packageDirs) {
      if (BOXES_AWAITING_SPLIT.has(packageDir)) continue;
      expect(BOX_KINDS, packageDir).toContain(boxKind(packageDir));
    }
    for (const packageDir of packageDirs.filter(
      (item) => boxKind(item) === "adapter",
    )) {
      expect(
        [...DRIVER_PORTS, ...ENGINE_PORTS],
        packageDir + " must be named <counterpart>-<port>-adapter",
      ).toContain(adapterPort(packageDir));
    }
  });

  it("keeps production imports within the declared box dependencies", () => {
    const sqliteBackedDb = ["engine", "sqlite-db-adapter"];
    const browserBundle = [
      "driver",
      "frontend-ui",
      "client-browser",
      "embedded-backend-adapter",
      "backend-api",
    ];
    const allowedBoxes: Record<string, string[]> = {
      driver: [],
      engine: [],
      "frontend-ui": ["driver"],
      "backend-api": ["engine"],
      "client-browser": [
        "driver",
        "frontend-ui",
        "browser-print-adapter",
        "browser-platform-adapter",
      ],
      "sqlite-db-adapter": ["engine"],
      "memory-db-adapter": sqliteBackedDb,
      "disk-db-adapter": sqliteBackedDb,
      "book-db-adapter": sqliteBackedDb,
      "legacy-db-adapter": sqliteBackedDb,
      "books-db-adapter": [...sqliteBackedDb, "book-db-adapter"],
      "embedded-backend-adapter": ["driver", "backend-api"],
      "browser-print-adapter": ["driver"],
      "browser-platform-adapter": ["driver"],
      "local-book-files-adapter": [
        "driver",
        "books-db-adapter",
        "book-db-adapter",
      ],
      cli: [
        "driver",
        "embedded-backend-adapter",
        "backend-api",
        "disk-db-adapter",
      ],
      "bundle-original": [
        ...browserBundle,
        "books-db-adapter",
        "legacy-db-adapter",
        "local-book-files-adapter",
        "browser-platform-adapter",
      ],
      "bundle-sim": [...browserBundle, "memory-db-adapter"],
      "bundle-demo": [...browserBundle, "memory-db-adapter"],
    };
    expect(Object.keys(allowedBoxes).sort()).toEqual(packageDirs);
    for (const record of packageRecords) {
      const allowed = new Set(
        allowedBoxes[record.packageDir]!.map(packageName),
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

  it("keeps the core boxes free of frameworks and of each other", () => {
    for (const record of packageRecords.filter(
      (item) => boxKind(item.packageDir) === "core",
    )) {
      expect(record.packageJson.dependencies, record.packageDir).toBe(
        undefined,
      );
      expect(record.packageJson.peerDependencies, record.packageDir).toBe(
        undefined,
      );
    }
  });

  it("keeps the calling side and the recording side from importing each other", () => {
    for (const record of packageRecords) {
      const side = boxSide(record.packageDir);
      if (side == null) continue;
      for (const importedPackage of findInternalImports(record.dir, true)) {
        const importedSide = boxSide(packageNameToDir.get(importedPackage)!);
        expect(
          importedSide == null || importedSide === side,
          record.packageDir + " -> " + importedPackage,
        ).toBe(true);
      }
    }
  });

  it("keeps the layers inside a box pointing inward", () => {
    const coreLayers = {
      domain: ["domain"],
      ports: ["ports", "domain"],
      usecases: ["usecases", "ports", "domain"],
    };
    const layersByBox: Record<string, Record<string, string[]>> = {
      driver: coreLayers,
      engine: coreLayers,
      "frontend-ui": { bindings: ["bindings"] },
    };
    const offenders: string[] = [];
    for (const [packageDir, layers] of Object.entries(layersByBox)) {
      const srcDir = path.join(packagesDir, packageDir, "src");
      for (const layer of Object.keys(layers)) {
        const layerDir = path.join(srcDir, layer);
        for (const file of sourceFiles(layerDir)) {
          if (/\.test\.tsx?$/.test(file)) continue;
          for (const specifier of relativeSpecifiers(file)) {
            const target = path.resolve(path.dirname(file), specifier);
            if (!target.startsWith(srcDir + path.sep)) continue;
            const targetLayer = path
              .relative(srcDir, target)
              .split(path.sep)[0]!;
            if (!layers[layer]!.includes(targetLayer)) {
              offenders.push(
                `${path.relative(rootDir, file)} -> ${targetLayer}`,
              );
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the driver/backend-api REST boundary type names in sync", () => {
    const driverTypes = exportedTypeNames(
      path.join(packagesDir, "driver/src/ports/backend/types.ts"),
    );
    const backendApiTypes = exportedTypeNames(
      path.join(packagesDir, "backend-api/src/contract.ts"),
    );
    const restBoundaryName =
      /(?:Request|Response|ApiRecord|Input|ApiErrorDto)$/;
    const driverBoundaryTypes = [...driverTypes]
      .filter((name) => restBoundaryName.test(name))
      .sort();
    const backendApiBoundaryTypes = [...backendApiTypes]
      .filter((name) => restBoundaryName.test(name))
      .filter((name) => !name.includes("Db"))
      .sort();

    expect(driverBoundaryTypes).toEqual(backendApiBoundaryTypes);
  });

  it("keeps the driver/backend-api REST boundary type and interface BODIES in sync", () => {
    const driverBodies = typeBodies(
      path.join(packagesDir, "driver/src/ports/backend/types.ts"),
    );
    const backendApiBodies = typeBodies(
      path.join(packagesDir, "backend-api/src/contract.ts"),
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
    const namesToCompare = [...driverBodies.keys()].filter(
      (name) =>
        (restBoundaryName.test(name) && !name.includes("Db")) ||
        sharedApiInterfaces.includes(name),
    );
    expect(namesToCompare.length).toBeGreaterThan(0);
    for (const name of namesToCompare) {
      if (!backendApiBodies.has(name)) continue;
      expect(
        backendApiBodies.get(name),
        `${name} の本文が driver と backend-api で食い違っています`,
      ).toBe(driverBodies.get(name));
    }
  });

  it("keeps the driver/backend-api HTTP endpoint metadata in sync", () => {
    const driverEndpoints = endpointMetadata(
      path.join(packagesDir, "driver/src/ports/backend/types.ts"),
    );
    const backendApiEndpoints = endpointMetadata(
      path.join(packagesDir, "backend-api/src/contract.ts"),
    );

    expect(driverEndpoints).toEqual(backendApiEndpoints);
  });

  it("keeps persistence types independent from REST DTOs", () => {
    const persistenceTypes = fs.readFileSync(
      path.join(packagesDir, "engine/src/ports/persistence-types.ts"),
      "utf8",
    );
    const dbPort = fs.readFileSync(
      path.join(packagesDir, "engine/src/ports/db-port.ts"),
      "utf8",
    );
    const sqliteAdapter = fs.readFileSync(
      path.join(packagesDir, "sqlite-db-adapter/src/adapter.ts"),
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
  return `@rubydogjp/openkk-${packageDir}`;
}

function boxKind(packageDir: string): BoxKind | null {
  if (packageDir === "driver" || packageDir === "engine") return "core";
  if (/^(?:frontend|backend)-[a-z]+$/.test(packageDir)) return "entry";
  if (/^(?:client|server)-[a-z]+$/.test(packageDir)) return "runtime";
  if (/^[a-z]+-[a-z-]+-adapter$/.test(packageDir)) return "adapter";
  if (/^bundle-[a-z]+$/.test(packageDir)) return "bundle";
  return null;
}

function isBundle(packageDir: string): boolean {
  return boxKind(packageDir) === "bundle";
}

function adapterPort(packageDir: string): string | null {
  return (
    [...DRIVER_PORTS, ...ENGINE_PORTS].find((port) =>
      packageDir.endsWith(`-${port}-adapter`),
    ) ?? null
  );
}

function boxSide(packageDir: string): string | null {
  if (packageDir === "driver") return CALLING_SIDE;
  if (packageDir === "engine") return RECORDING_SIDE;
  if (/^(?:frontend|client)-/.test(packageDir)) return CALLING_SIDE;
  if (/^(?:backend|server)-/.test(packageDir)) return RECORDING_SIDE;
  if (boxKind(packageDir) !== "adapter") return null;
  const port = adapterPort(packageDir)!;
  if (SAME_PROCESS_BRIDGE_PORTS.includes(port)) return null;
  return ENGINE_PORTS.includes(port) ? RECORDING_SIDE : CALLING_SIDE;
}

function relativeSpecifiers(file: string): string[] {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const out: string[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier != null &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      out.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return out;
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
