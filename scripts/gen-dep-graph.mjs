#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { formatGenerated } from "./format-generated.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const packagesDirectory = path.join(rootDirectory, "packages");
const outputPath = path.join(rootDirectory, "docs", "dependency-graph.md");
const checkOnly = process.argv.includes("--check");

const packages = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const packageJsonPath = path.join(
      packagesDirectory,
      entry.name,
      "package.json",
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (typeof packageJson.name !== "string" || packageJson.name === "") {
      throw new Error(`Package name is missing: packages/${entry.name}`);
    }
    const dependencies = Object.keys(packageJson.dependencies ?? {}).filter(
      (dependency) => dependency.startsWith("@rubydogjp/openkk-"),
    );
    return { name: packageJson.name, dependencies };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const SCOPE_PREFIX = "@rubydogjp/openkk-";
const DRIVER_PORTS = ["backend", "print", "platform", "book-files"];

function boxName(name) {
  return name.slice(SCOPE_PREFIX.length);
}

function isAdapterOf(name, ports) {
  return ports.some((port) => boxName(name).endsWith(`-${port}-adapter`));
}

const LAYERS = [
  {
    id: "bundle",
    label: "製品 (bundle-*)",
    note: "動く形・口の実装・設定を選んで束ねた、利用者から見た 1 つの製品",
    match: (name) => /^bundle-/.test(boxName(name)),
  },
  {
    id: "runtime",
    label: "動く形 (client-*・server-*)",
    note: "入口を、ある環境で動かすための薄い箱",
    match: (name) => /^(?:client|server)-/.test(boxName(name)),
  },
  {
    id: "entry",
    label: "入口 (frontend-*・backend-*)",
    note: "中身を、画面 (ui)・コマンド (cli)・呼び出し (api) のどれかの形で受けるもの",
    match: (name) => /^(?:frontend|backend)-/.test(boxName(name)),
  },
  {
    id: "driver_adapter",
    label: "口の実装 (driver の口)",
    note: "`driver` が外に求める口 (backend・print・platform・book-files) の実装。利用側は backend の実装を差し替える",
    match: (name) => isAdapterOf(name, DRIVER_PORTS),
  },
  {
    id: "engine_adapter",
    label: "口の実装 (engine の口)",
    note: "`engine` が外に求める口 (db) の実装。サーバーを別に持つ製品では使わない",
    match: (name) => isAdapterOf(name, ["db"]),
  },
  {
    id: "core",
    label: "中身 (driver・engine)",
    note: "決まり・手続き・外に求める口。`driver` が使う側、`engine` が受ける側。入口の形も、動かす場所も知らない",
    match: (name) => boxName(name) === "driver" || boxName(name) === "engine",
  },
];

function shortName(name) {
  return boxName(name);
}

function resolveLayerId(name) {
  for (const layer of LAYERS) {
    if (layer.match(name)) return layer.id;
  }
  return null;
}

validatePackages();

function validatePackages() {
  const packageNames = new Set();
  for (const workspacePackage of packages) {
    if (packageNames.has(workspacePackage.name)) {
      throw new Error(`Duplicate package name: ${workspacePackage.name}`);
    }
    packageNames.add(workspacePackage.name);
  }
  for (const workspacePackage of packages) {
    const missingDependencies = workspacePackage.dependencies.filter(
      (dependency) => !packageNames.has(dependency),
    );
    if (missingDependencies.length > 0) {
      const dependencyNames = missingDependencies.join(", ");
      throw new Error(
        `Unknown internal dependencies in ${workspacePackage.name}: ${dependencyNames}`,
      );
    }
    if (resolveLayerId(workspacePackage.name) == null) {
      throw new Error(`Package layer is not defined: ${workspacePackage.name}`);
    }
  }
}

const packagesByLayer = {};
for (const layer of LAYERS) packagesByLayer[layer.id] = [];
for (const workspacePackage of packages) {
  packagesByLayer[resolveLayerId(workspacePackage.name)].push(workspacePackage);
}

function nodeId(name) {
  return name.replace(/^@/, "").replace(/[/-]/g, "_");
}

const lines = [];
lines.push("```mermaid");
lines.push("graph LR");

for (const layer of LAYERS) {
  const items = packagesByLayer[layer.id];
  if (items.length === 0) continue;
  lines.push(`  subgraph ${layer.id}["${layer.label}"]`);
  for (const workspacePackage of items) {
    lines.push(
      `    ${nodeId(workspacePackage.name)}["${shortName(workspacePackage.name)}"]`,
    );
  }
  lines.push("  end");
  lines.push("");
}

for (const workspacePackage of packages) {
  for (const dependency of workspacePackage.dependencies) {
    lines.push(`  ${nodeId(workspacePackage.name)} --> ${nodeId(dependency)}`);
  }
}
lines.push("```");

const mermaidBlock = lines.join("\n");

const dependentsByPackageName = new Map();
for (const workspacePackage of packages) {
  dependentsByPackageName.set(workspacePackage.name, []);
}
for (const workspacePackage of packages) {
  for (const dependency of workspacePackage.dependencies) {
    if (dependentsByPackageName.has(dependency)) {
      dependentsByPackageName.get(dependency).push(workspacePackage.name);
    }
  }
}

const tableLines = [];
tableLines.push("| Package | Group | Depends on | Depended by |");
tableLines.push("|---|---|---|---|");
for (const workspacePackage of packages) {
  const layer = resolveLayerId(workspacePackage.name);
  const dependenciesCell =
    workspacePackage.dependencies.length === 0
      ? "—"
      : workspacePackage.dependencies
          .map((dependency) => `\`${dependency}\``)
          .join(", ");
  const dependents = dependentsByPackageName.get(workspacePackage.name);
  const dependedCell =
    dependents.length === 0
      ? "—"
      : dependents.map((dependent) => `\`${dependent}\``).join(", ");
  tableLines.push(
    `| \`${workspacePackage.name}\` | ${layer} | ${dependenciesCell} | ${dependedCell} |`,
  );
}
const tableBlock = tableLines.join("\n");

const layerDescriptionLines = LAYERS.filter(
  (layer) => packagesByLayer[layer.id].length > 0,
)
  .map((layer) => `| **${layer.label}** | ${layer.note} |`)
  .join("\n");

const content = await formatGenerated(
  outputPath,
  `# オープン会計 dependency graph

オープン会計 の箱 (パッケージ) が互いをどう使うかをまとめた図です。
箱の名前は \`@rubydogjp/openkk-<箱の名前>\` です。箱の種類と中の層は [\`architecture.md\`](./architecture.md) にあります。

## Mermaid graph

GitHub・VSCode の Markdown preview で Mermaid がそのまま render されます。
LR (left-to-right) 方向: 左ほど製品に近く、右ほど中身に近い。

${mermaidBlock}

## グループ説明

| Group | 役割 |
|---|---|
${layerDescriptionLines}

> **利用側が差し替える範囲**
> - **製品** → 丸ごと差し替える (自前の製品)
> - **動く形** → そのまま使うか、自前の配線に差し替える
> - **口の実装 (driver の口)** の \`embedded-backend-adapter\` → 自前の HTTP の実装に差し替える
> - **入口 (frontend-*)** と \`driver\` → そのまま使う
> - **backend-api・engine・口の実装 (engine の口)** → サーバーを別に持つ製品では使わない

## 口と実装

中身の箱が外に求める口は **Port**、実装の箱は \`<相手>-<口>-adapter\` と名付ける。

| 口 | Interface | 定める箱 | 実装の箱 |
|---|---|---|---|
| backend | \`OpenkkBackendPort\` | \`driver\` | \`embedded-backend-adapter\`、利用側の HTTP の実装 |
| print | \`PrintPort\` | \`driver\` | \`browser-print-adapter\` |
| platform | \`PlatformPort\` | \`driver\` | \`browser-platform-adapter\` |
| book-files | \`OpenkkBookFilesPort\` | \`driver\` | \`local-book-files-adapter\` |
| db | \`OpenkkDbPort\` | \`engine\` | \`memory-db-adapter\`、\`books-db-adapter\`、\`book-db-adapter\`、\`disk-db-adapter\`、\`legacy-db-adapter\` (共通の実装は \`sqlite-db-adapter\`) |

## Per-package table

${tableBlock}

## 再生成

\`\`\`bash
cd openkk
npm run gen-deps
\`\`\`
`,
);

if (checkOnly) {
  if (readFileSync(outputPath, "utf8") !== content) {
    throw new Error("Generated dependency graph is stale");
  }
  process.exit(0);
}

writeFileSync(outputPath, content);
console.log(`Generated: ${path.relative(process.cwd(), outputPath)}`);
console.log(`  ${packages.length} packages scanned`);
const dependencyCount = packages.reduce(
  (count, workspacePackage) => count + workspacePackage.dependencies.length,
  0,
);
console.log(`  ${dependencyCount} dependency edges`);
console.log("");
console.log("Groups:");
for (const layer of LAYERS) {
  const items = packagesByLayer[layer.id];
  if (items.length === 0) continue;
  const packageNames = items
    .map((workspacePackage) => shortName(workspacePackage.name))
    .join(", ");
  console.log(`  [${layer.label}] ${packageNames}`);
}
