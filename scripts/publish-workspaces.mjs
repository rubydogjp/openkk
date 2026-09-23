#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dryRun = process.argv.includes("--dry-run");

const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const targets = rootPkg.workspaces
  .map((workspace) => ({
    workspace,
    pkg: JSON.parse(
      readFileSync(path.join(root, workspace, "package.json"), "utf8"),
    ),
  }))
  .filter(({ pkg }) => !pkg.private);

for (const { workspace, pkg } of targets) {
  const spec = `${pkg.name}@${pkg.version}`;
  if (isPublished(spec)) {
    console.log(`  skip ${spec}`);
    continue;
  }
  execFileSync(
    "npm",
    [
      "publish",
      "--workspace",
      workspace,
      "--access",
      "public",
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { cwd: root, stdio: "inherit" },
  );
  console.log(`  ok   ${spec}`);
}

function isPublished(spec) {
  const result = spawnSync("npm", ["view", spec, "version"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) return result.stdout.trim() !== "";
  if (/E404/.test(result.stderr)) return false;
  throw new Error(`npm view ${spec} failed:\n${result.stderr}`);
}
