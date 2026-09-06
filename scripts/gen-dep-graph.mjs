#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
      (dependency) =>
        dependency === "@rubydogjp/openkk" ||
        dependency.startsWith("@rubydogjp/openkk-"),
    );
    return { name: packageJson.name, dependencies };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const LAYERS = [
  {
    id: "app",
    label: "App",
    note: "リファレンスアプリ。consumer が自前アプリに差し替える",
    match: (name) =>
      name === "@rubydogjp/openkk" ||
      name === "@rubydogjp/openkk-sim" ||
      name === "@rubydogjp/openkk-demo",
  },
  {
    id: "app_support",
    label: "App Support",
    note: "3アプリで共有する bundle 非依存の runtime composition",
    match: (name) => name === "@rubydogjp/openkk-frontend",
  },
  {
    id: "client_adapters",
    label: "Client Adapters",
    note: "`OpenkkBackendPort` / `PrintPort` の実装群。consumer は backend adapter を差し替える",
    match: (name) =>
      name === "@rubydogjp/openkk-embedded-backend-adapter" ||
      name === "@rubydogjp/openkk-print-adapter",
  },
  {
    id: "client",
    label: "Client",
    note: "UI アプリが消費する layer 群。consumer がそのまま流用する",
    match: (name) =>
      name === "@rubydogjp/openkk-client" ||
      name.startsWith("@rubydogjp/openkk-client-"),
  },
  {
    id: "embedded_backend",
    label: "Embedded Backend",
    note: "in-process バックエンドの composition root。クラウド利用時は不要",
    match: (name) => name === "@rubydogjp/openkk-embedded-backend",
  },
  {
    id: "server_adapters",
    label: "Server Adapters",
    note: "`OpenkkDbPort` の実装群。クラウド利用時は不要",
    match: (name) =>
      name === "@rubydogjp/openkk-file-db-adapter" ||
      name === "@rubydogjp/openkk-memory-db-adapter",
  },
  {
    id: "server",
    label: "Server",
    note: "server-side host が消費する layer 群。クラウド利用時は不要",
    match: (name) =>
      name === "@rubydogjp/openkk-server" ||
      name.startsWith("@rubydogjp/openkk-server-"),
  },
];

function shortName(name) {
  if (name === "@rubydogjp/openkk") return "openkk";
  if (name === "@rubydogjp/openkk-sim") return "openkk-sim";
  if (name === "@rubydogjp/openkk-demo") return "openkk-demo";
  return name.replace(/^@rubydogjp\/openkk-/, "");
}

function resolveLayerId(name) {
  for (const layer of LAYERS) {
    if (layer.match(name)) return layer.id;
  }
  return undefined;
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
    lines.push(
      `  ${nodeId(workspacePackage.name)} --> ${nodeId(dependency)}`,
    );
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

const layerDescLines = LAYERS.filter(
  (layer) => packagesByLayer[layer.id].length > 0,
)
  .map((layer) => `| **${layer.label}** | ${layer.note} |`)
  .join("\n");

const content = `# オープン会計 dependency graph

オープン会計 配下の各 npm パッケージが互いをどう依存しているかをまとめた図です。
パッケージは全て \`@rubydogjp/\` scope。\`@rubydogjp/openkk\` がメイン (= App composition root)、それ以外は \`@rubydogjp/openkk-<short>\` 形式。

## Mermaid graph

GitHub・VSCode の Markdown preview で Mermaid がそのまま render されます。
LR (left-to-right) 方向: 左ほど上位 (composition root)、右ほど下位 (pure domain)。

${mermaidBlock}

## グループ説明

| Group | 役割 |
|---|---|
${layerDescLines}

> **Consumer app が差し替える範囲**
> - **App** グループ → 丸ごと差し替える (自前アプリ)
> - **App Support** → 共通 runtime composition を流用するか自前の配線へ差し替える
> - **Client Adapters** の \`embedded-backend-adapter\` → 自社 HTTP adapter に差し替える
> - **Client** グループ → そのまま流用 (OSS の恩恵)
> - **Embedded Backend / Server Adapters / Server** → 使わない (バックエンドは Cloud Run 等)

## Port interface 命名規則

\`*-ports\` パッケージで定義される interface は **Port** サフィックス、実装パッケージは **Adapter** サフィックスで区別する。

| Interface (Port) | 定義場所 | 実装パッケージ |
|---|---|---|
| \`OpenkkBackendPort\` | \`client-ports\` | \`embedded-backend-adapter\`、consumer 独自 HTTP adapter |
| \`PrintPort\` | \`client-ports\` | \`print-adapter\` |
| \`OpenkkDbPort\` | \`server-ports\` | \`file-db-adapter\`、\`memory-db-adapter\` |
| \`OpenkkServerPort\` | \`server-ports\` | \`server-api\` (via \`server\` meta) |

## Per-package table

${tableBlock}

## 再生成

\`\`\`bash
cd openkk
npm run gen-deps
\`\`\`
`;

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
console.log(`  ${dependencyCount} dep edges`);
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
