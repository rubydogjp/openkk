#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const dryRun = process.argv.includes("--dry-run");

const rootPackage = JSON.parse(
  readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
);

const targets = rootPackage.workspaces
  .map((workspace) => ({
    workspace,
    workspacePackage: JSON.parse(
      readFileSync(path.join(rootDirectory, workspace, "package.json"), "utf8"),
    ),
  }))
  .filter(({ workspacePackage }) => !workspacePackage.private);

for (const { workspace, workspacePackage } of targets) {
  const spec = `${workspacePackage.name}@${workspacePackage.version}`;
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
    { cwd: rootDirectory, stdio: "inherit" },
  );
  console.log(`  ok   ${spec}`);
}

function isPublished(spec) {
  const result = spawnSync("npm", ["view", spec, "version"], {
    cwd: rootDirectory,
    encoding: "utf8",
  });
  if (result.status === 0) return result.stdout.trim() !== "";
  if (/E404/.test(result.stderr)) return false;
  throw new Error(`npm view ${spec} failed:\n${result.stderr}`);
}
