#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packagesDir = path.join(root, "packages");

const tag = process.argv[2];

if (!tag) {
  console.error("usage: node scripts/verify-release-version.mjs <tag>");
  console.error("   ex: node scripts/verify-release-version.mjs v26.1.8");
  process.exit(1);
}

const expected = tag.replace(/^v/, "");

const mismatched = [];

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const pkg = JSON.parse(
    readFileSync(path.join(packagesDir, entry.name, "package.json"), "utf8"),
  );

  if (pkg.version !== expected) {
    mismatched.push(`${pkg.name}: ${pkg.version}`);
  }
}

if (mismatched.length > 0) {
  console.error(`tag ${tag} は version ${expected} を期待しますが、一致しないパッケージがあります:`);
  for (const line of mismatched) console.error(`  ${line}`);
  console.error("");
  console.error(`node scripts/set-version.mjs ${expected} で揃えてから再度タグを打ってください。`);
  process.exit(1);
}

console.log(`tag ${tag} と全 workspace の version ${expected} が一致しています。`);
