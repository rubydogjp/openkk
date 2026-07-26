#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packagesDir = path.join(root, "packages");

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

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

const changed = [];

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const pkgJsonPath = path.join(packagesDir, entry.name, "package.json");
  const before = readFileSync(pkgJsonPath, "utf8");
  const pkg = JSON.parse(before);

  pkg.version = version;

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (isInternal(name)) deps[name] = `^${version}`;
    }
  }

  const after = `${JSON.stringify(pkg, null, 2)}${before.endsWith("\n") ? "\n" : ""}`;
  if (after !== before) {
    writeFileSync(pkgJsonPath, after);
    changed.push(pkg.name);
  }
}

console.log(`set version ${version} on ${changed.length} packages:`);
for (const name of changed.sort()) console.log(`  ${name}`);

execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
  cwd: root,
  stdio: "inherit",
});
