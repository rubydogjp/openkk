import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packagesDir = path.resolve(import.meta.dirname, "../packages");
const BUILDER_FILE = /(?:\.test\.tsx?$|^[^/]+\/test-support\/)/;
const EXTERNAL_SHAPE_FILES = new Set([
  "file-db-adapter/src/index.test.ts",
  "file-db-adapter/src/sqlite.worker.ts",
  "frontend/src/service-worker.test.ts",
  "sqlite-adapter/src/migrate.test.ts",
  "sqlite-adapter/src/sql-db.ts",
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "dist"
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function isPatch(node: ts.Node): boolean {
  for (let parent = node.parent; parent != null; parent = parent.parent) {
    if (
      (ts.isTypeAliasDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent)) &&
      /Patch(?:Input)?$/.test(parent.name.text)
    )
      return true;
    if (ts.isParameter(parent) && parent.name.getText() === "patch")
      return true;
  }
  return false;
}

function violations(source: string, file: string): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  const builder = BUILDER_FILE.test(file);
  function visit(node: ts.Node): void {
    let reason: string | null = null;
    if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
      reason = "undefined type";
    } else if (!builder && ts.isParameter(node) && node.initializer != null) {
      reason = "default parameter";
    } else if (
      (ts.isParameter(node) ||
        ts.isPropertySignature(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isMethodSignature(node)) &&
      node.questionToken != null &&
      !isPatch(node)
    ) {
      reason = "optional declaration";
    } else if (
      ts.isTypeReferenceNode(node) &&
      node.typeName.getText(ast) === "Partial" &&
      !builder &&
      !isPatch(node)
    ) {
      reason = "Partial outside patch";
    } else if (
      ts.isIndexedAccessTypeNode(node) &&
      /PatchInput$/.test(node.objectType.getText(ast)) &&
      !(
        ts.isTypeReferenceNode(node.parent) &&
        node.parent.typeName.getText(ast) === "NonNullable"
      )
    ) {
      reason = "nullable patch property type";
    }
    if (reason != null) {
      const line =
        ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      findings.push(file + ":" + line + ": " + reason);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return findings;
}

describe("explicit null instead of undefined", () => {
  it("requires explicit values outside patches and external shapes", () => {
    const findings: string[] = [];
    for (const packageDir of fs.readdirSync(packagesDir)) {
      for (const subdir of ["src", "app", "demo", "test-support"]) {
        const dir = path.join(packagesDir, packageDir, subdir);
        if (!fs.existsSync(dir)) continue;
        for (const file of sourceFiles(dir)) {
          const relative = path
            .relative(packagesDir, file)
            .split(path.sep)
            .join("/");
          if (EXTERNAL_SHAPE_FILES.has(relative)) continue;
          findings.push(...violations(fs.readFileSync(file, "utf8"), relative));
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it.each([
    "function read(value = null) {}",
    "type Value = { 'name'?: string };",
    "type Value = { name:\n string |\n undefined };",
    "type Value = Partial<{ name: string }>;",
  ])("rejects %s", (source) => {
    expect(violations(source, "example.ts")).not.toEqual([]);
  });

  it("permits explicit null and patch omission", () => {
    expect(
      violations(
        [
          "type Value = { name: string | null };",
          "type ValuePatchInput = { name?: string | null };",
          "function read(value: Value | null) {}",
        ].join("\n"),
        "example.ts",
      ),
    ).toEqual([]);
  });
});
