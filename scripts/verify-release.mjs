#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const packagesDirectory = path.join(rootDirectory, "packages");

const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? "";
const expected = tag.replace(/^v/, "");

const rootPackage = JSON.parse(
  readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
);
const rootLicense = readFileSync(path.join(rootDirectory, "LICENSE"), "utf8");
const repoUrl = (rootPackage.repository?.url ?? "")
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");

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

for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const workspacePackage = JSON.parse(
    readFileSync(
      path.join(packagesDirectory, entry.name, "package.json"),
      "utf8",
    ),
  );

  if (workspacePackage.version !== expected && expected !== "") {
    problems.push(
      `${workspacePackage.name}: version ${workspacePackage.version} が tag ${tag} と一致しません`,
    );
  }

  if (workspacePackage.private) continue;

  for (const field of REQUIRED) {
    if (!workspacePackage[field])
      problems.push(`${workspacePackage.name}: ${field} がありません`);
  }

  const packageLicensePath = path.join(
    packagesDirectory,
    entry.name,
    "LICENSE",
  );
  if (workspacePackage.license !== rootPackage.license) {
    problems.push(
      `${workspacePackage.name}: license が root package と一致しません`,
    );
  }
  if (!existsSync(packageLicensePath)) {
    problems.push(`${workspacePackage.name}: LICENSE がありません`);
  } else if (readFileSync(packageLicensePath, "utf8") !== rootLicense) {
    problems.push(
      `${workspacePackage.name}: LICENSE が root LICENSE と一致しません`,
    );
  }

  const url = (workspacePackage.repository?.url ?? "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
  if (workspacePackage.repository && url !== repoUrl) {
    problems.push(
      `${workspacePackage.name}: repository.url が ${repoUrl} と一致しません (${url})`,
    );
  }
  if (workspacePackage.repository && !workspacePackage.repository.directory) {
    problems.push(
      `${workspacePackage.name}: repository.directory がありません`,
    );
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
