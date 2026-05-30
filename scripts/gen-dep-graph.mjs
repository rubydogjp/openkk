#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packagesDir = path.join(root, "packages");
const outFile = path.join(root, "docs", "dependency-graph.md");

const pkgs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const pkgJsonPath = path.join(packagesDir, e.name, "package.json");
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const deps = Object.keys(pkg.dependencies ?? {}).filter(
      (d) => d === "@rubydogjp/openkk" || d.startsWith("@rubydogjp/openkk-"),
    );
    return { name: pkg.name, dir: e.name, deps };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const LAYERS = [
  {
    id: "app",
    label: "App",
    note: "リファレンスアプリ。consumer が自前アプリに差し替える",
    match: (name) => name === "@rubydogjp/openkk",
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
  {
    id: "other",
    label: "Other",
    note: "未分類",
    match: () => true,
  },
];

function shortName(name) {
  if (name === "@rubydogjp/openkk") return "openkk";
  return name.replace(/^@rubydogjp\/openkk-/, "");
}

function layerOf(name) {
  for (const l of LAYERS) {
    if (l.match(name)) return l.id;
  }
  return "other";
}

const byLayer = {};
for (const l of LAYERS) byLayer[l.id] = [];
for (const p of pkgs) byLayer[layerOf(p.name)].push(p);

function nodeId(name) {
  return name.replace(/^@/, "").replace(/[/-]/g, "_");
}

const lines = [];
lines.push("```mermaid");
lines.push("graph LR");

for (const l of LAYERS) {
  const items = byLayer[l.id];
  if (items.length === 0) continue;
  lines.push(`  subgraph ${l.id}["${l.label}"]`);
  for (const p of items) {
    lines.push(`    ${nodeId(p.name)}["${shortName(p.name)}"]`);
  }
  lines.push("  end");
  lines.push("");
}

for (const p of pkgs) {
  for (const d of p.deps) {
    lines.push(`  ${nodeId(p.name)} --> ${nodeId(d)}`);
  }
}
lines.push("```");

const mermaidBlock = lines.join("\n");

const dependedBy = new Map();
for (const p of pkgs) dependedBy.set(p.name, []);
for (const p of pkgs) {
  for (const d of p.deps) {
    if (dependedBy.has(d)) dependedBy.get(d).push(p.name);
  }
}

const tableLines = [];
tableLines.push("| Package | Group | Depends on | Depended by |");
tableLines.push("|---|---|---|---|");
for (const p of pkgs) {
  const layer = layerOf(p.name);
  const depsCell = p.deps.length === 0 ? "—" : p.deps.map((d) => `\`${d}\``).join(", ");
  const dependedCell =
    dependedBy.get(p.name).length === 0
      ? "—"
      : dependedBy.get(p.name).map((d) => `\`${d}\``).join(", ");
  tableLines.push(`| \`${p.name}\` | ${layer} | ${depsCell} | ${dependedCell} |`);
}
const tableBlock = tableLines.join("\n");

const layerDescLines = LAYERS.filter((l) => byLayer[l.id].length > 0 && l.id !== "other")
  .map((l) => `| **${l.label}** | ${l.note} |`)
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

writeFileSync(outFile, content);
console.log(`Generated: ${path.relative(process.cwd(), outFile)}`);
console.log(`  ${pkgs.length} packages scanned`);
console.log(`  ${pkgs.reduce((n, p) => n + p.deps.length, 0)} dep edges`);
console.log("");
console.log("Groups:");
for (const l of LAYERS) {
  const items = byLayer[l.id];
  if (items.length === 0) continue;
  console.log(`  [${l.label}] ${items.map((p) => shortName(p.name)).join(", ")}`);
}
