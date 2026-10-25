#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const packagesDirectory = path.join(rootDirectory, "packages");

const WORKFLOW_FILE = "release.yml";

const rootPackage = JSON.parse(
  readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
);
const repoMatch = /github\.com[/:]([^/]+\/[^/.]+)/.exec(
  rootPackage.repository?.url ?? "",
);

if (!repoMatch) {
  console.error(
    "package.json の repository.url から owner/repo を判定できません",
  );
  process.exit(1);
}

const repo = repoMatch[1];

const targets = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    JSON.parse(
      readFileSync(
        path.join(packagesDirectory, entry.name, "package.json"),
        "utf8",
      ),
    ),
  )
  .filter((workspacePackage) => !workspacePackage.private)
  .map((workspacePackage) => workspacePackage.name)
  .sort();

console.log(
  `${repo} / ${WORKFLOW_FILE} を ${targets.length} パッケージに設定します`,
);
console.log(
  "最初の 2FA 画面で「次の 5 分間はスキップ」を選ぶと、残りは無認証で通ります。",
);
console.log("");

const failed = [];

for (const name of targets) {
  const { status, stderr } = await trust(name);
  if (status === 0) {
    console.log(`  ok   ${name}`);
  } else if (/\bE409\b/.test(stderr)) {
    console.log(`  skip ${name} (設定済み)`);
  } else {
    failed.push(name);
    console.log(`  FAIL ${name}`);
  }
}

if (failed.length > 0) {
  console.error("");
  console.error(`${failed.length} 件が失敗しました:`);
  for (const name of failed) console.error(`  ${name}`);
  console.error("");
  console.error("再実行すれば残りが処理されます。");
  process.exit(1);
}

console.log("");
console.log("完了。npm trust list <package> で確認できます。");

function trust(name) {
  return new Promise((resolve) => {
    const child = spawn(
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
      { cwd: rootDirectory, stdio: ["inherit", "inherit", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      stderr += chunk;
    });
    child.on("error", (error) =>
      resolve({ status: null, stderr: String(error) }),
    );
    child.on("close", (status) => resolve({ status, stderr }));
  });
}
