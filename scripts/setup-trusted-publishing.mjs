#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packagesDir = path.join(root, "packages");

const WORKFLOW_FILE = "release.yml";

const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const repoMatch = /github\.com[/:]([^/]+\/[^/.]+)/.exec(rootPkg.repository?.url ?? "");

if (!repoMatch) {
  console.error("package.json の repository.url から owner/repo を判定できません");
  process.exit(1);
}

const repo = repoMatch[1];

const targets = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    JSON.parse(
      readFileSync(path.join(packagesDir, entry.name, "package.json"), "utf8"),
    ),
  )
  .filter((pkg) => !pkg.private)
  .map((pkg) => pkg.name)
  .sort();

console.log(`${repo} / ${WORKFLOW_FILE} を ${targets.length} パッケージに設定します`);

const failed = [];

for (const name of targets) {
  try {
    execFileSync(
      "npm",
      [
        "trust",
        "github",
        name,
        "--file",
        WORKFLOW_FILE,
        "--repo",
        repo,
        "--allow-publish",
        "--yes",
      ],
      { cwd: root, stdio: "inherit" },
    );
    console.log(`  ok   ${name}`);
  } catch {
    failed.push(name);
    console.error(`  FAIL ${name}`);
  }
}

if (failed.length > 0) {
  console.error("");
  console.error(`${failed.length} 件が失敗しました:`);
  for (const name of failed) console.error(`  ${name}`);
  console.error("");
  console.error("パッケージが npm 上に存在しない場合は先に publish が必要です。");
  process.exit(1);
}

console.log("");
console.log("完了。npm trust list <package> で確認できます。");
