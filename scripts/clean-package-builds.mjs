#!/usr/bin/env node

import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(
  readFileSync(join(rootDirectory, "package.json"), "utf8"),
);

for (const workspace of rootPackage.workspaces) {
  const workspaceDirectory = join(rootDirectory, workspace);
  const workspacePackage = JSON.parse(
    readFileSync(join(workspaceDirectory, "package.json"), "utf8"),
  );
  if (workspacePackage.private) continue;
  rmSync(join(workspaceDirectory, "dist"), { recursive: true, force: true });
}
