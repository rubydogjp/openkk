#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const packagesDirectory = path.join(rootDirectory, "packages");

const version = process.argv[2];

if (!version) {
  console.error("usage: node scripts/set-version.mjs <version>");
  console.error("   ex: node scripts/set-version.mjs 26.1.8");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`invalid semver: ${version}`);
  process.exit(1);
}

const isInternal = (name) =>
  name === "@rubydogjp/openkk" || name.startsWith("@rubydogjp/openkk-");

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
];

const changed = [];

for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageJsonPath = path.join(
    packagesDirectory,
    entry.name,
    "package.json",
  );
  const before = readFileSync(packageJsonPath, "utf8");
  const workspacePackage = JSON.parse(before);

  workspacePackage.version = version;

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = workspacePackage[field];
    if (!dependencies) continue;
    for (const name of Object.keys(dependencies)) {
      if (isInternal(name)) dependencies[name] = `^${version}`;
    }
  }

  const after = `${JSON.stringify(workspacePackage, null, 2)}${before.endsWith("\n") ? "\n" : ""}`;
  if (after !== before) {
    writeFileSync(packageJsonPath, after);
    changed.push(workspacePackage.name);
  }
}

console.log(`set version ${version} on ${changed.length} packages:`);
for (const name of changed.sort()) console.log(`  ${name}`);

execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
  cwd: rootDirectory,
  stdio: "inherit",
});
