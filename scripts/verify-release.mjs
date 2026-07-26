#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packagesDir = path.join(root, "packages");

const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? "";
const expected = tag.replace(/^v/, "");

const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const repoUrl = (rootPkg.repository?.url ?? "")
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");

// provenance の検証は repository.url がリポジトリと一致することを要求する。
// 欠けていると 15 件 publish したあとで落ちる、といった部分リリースになる。
const REQUIRED = [
  "description",
  "license",
  "author",
  "homepage",
  "bugs",
  "repository",
  "files",
  "publishConfig",
];

const problems = [];

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const pkg = JSON.parse(
    readFileSync(path.join(packagesDir, entry.name, "package.json"), "utf8"),
  );

  if (pkg.version !== expected && expected !== "") {
    problems.push(`${pkg.name}: version ${pkg.version} が tag ${tag} と一致しません`);
  }

  if (pkg.private) continue;

  for (const field of REQUIRED) {
    if (!pkg[field]) problems.push(`${pkg.name}: ${field} がありません`);
  }

  const url = (pkg.repository?.url ?? "").replace(/^git\+/, "").replace(/\.git$/, "");
  if (pkg.repository && url !== repoUrl) {
    problems.push(`${pkg.name}: repository.url が ${repoUrl} と一致しません (${url})`);
  }
  if (pkg.repository && !pkg.repository.directory) {
    problems.push(`${pkg.name}: repository.directory がありません`);
  }
}

if (problems.length > 0) {
  console.error("publish 前の検証に失敗しました:");
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}

console.log(
  expected === ""
    ? "publish メタデータは揃っています。"
    : `tag ${tag} と全 workspace の version ${expected} が一致し、publish メタデータも揃っています。`,
);
