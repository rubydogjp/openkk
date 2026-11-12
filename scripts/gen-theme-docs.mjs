#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { formatGenerated } from "./format-generated.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const tokensPath = path.join(
  rootDirectory,
  "packages/frontend-ui/src/shared/design-tokens.ts",
);
const outputPath = path.join(rootDirectory, "docs", "theming.md");
const checkOnly = process.argv.includes("--check");

const ts = createRequire(tokensPath)("typescript");
const { outputText } = ts.transpileModule(readFileSync(tokensPath, "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const tokens = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const parseCssVariable = (value) => {
  const match = /^var\((--openkk-[a-z0-9-]+),\s*([\s\S]+)\)$/.exec(value);
  return match ? { name: match[1], fallback: match[2] } : null;
};

const flatGroups = [
  ["色 (palette)", tokens.palette, "palette"],
  ["影 (shadows)", tokens.shadows, "shadows"],
  ["フォーカスリング (rings)", tokens.rings, "rings"],
  ["フォントサイズ (fontSize)", tokens.fontSize, "fontSize"],
  ["フォントウェイト (fontWeight)", tokens.fontWeight, "fontWeight"],
  ["フォントファミリー (fontFamily)", tokens.fontFamily, "fontFamily"],
  ["余白 (spacing)", tokens.spacing, "spacing"],
  ["角丸 (radii)", tokens.radii, "radii"],
];

const groups = flatGroups.map(([label, group, key]) => ({
  label,
  entries: Object.entries(group)
    .map(([name, value]) => ({
      key: `${key}.${name}`,
      ...parseCssVariable(value),
    }))
    .filter((entry) => entry.name),
}));

groups.push({
  label: "寸法 (sizes)",
  entries: Object.entries(tokens.sizes).flatMap(([sizeGroup, group]) =>
    Object.entries(group)
      .map(([name, value]) => ({
        key: `sizes.${sizeGroup}.${name}`,
        ...parseCssVariable(value),
      }))
      .filter((entry) => entry.name),
  ),
});

groups.push({
  label: "文字スタイル (typography)",
  entries: Object.entries(tokens.typography).flatMap(([token, style]) =>
    Object.entries(style)
      .map(([property, value]) => ({
        key: `typography.${token}.${property}`,
        ...parseCssVariable(value),
      }))
      .filter((entry) => entry.name),
  ),
});

const total = groups.reduce((count, group) => count + group.entries.length, 0);

const escapeTableCell = (text) => text.replace(/\|/g, "\\|");

const tables = groups
  .map(
    ({ label, entries }) => `### ${label}

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
${entries
  .map(
    (entry) =>
      `| \`${entry.name}\` | \`${entry.key}\` | \`${escapeTableCell(entry.fallback)}\` |`,
  )
  .join("\n")}
`,
  )
  .join("\n");

const markdown = await formatGenerated(
  outputPath,
  `<!-- npm run gen-theme-docs で生成。直接編集しない。 -->

# テーマの差し替え

\`@rubydogjp/openkk-frontend-ui\` のデザイントークンは CSS custom property
(\`--openkk-*\`) 経由で解決される。OpenKK のコンポーネントより上の任意の要素で
\`--openkk-*\` を定義すれば見た目を差し替えられる。定義しなかったトークンは既定値のまま。

\`\`\`css
:root {
  --openkk-color-action: #7C3AED;
  --openkk-color-text: #1F2937;
  --openkk-radius-sm: 0px;
}
\`\`\`

範囲を限定したい場合は、任意の祖先要素に付ければその配下だけに効く。

\`\`\`tsx
<div style={{ "--openkk-color-action": "#7C3AED" } as CSSProperties}>
  <EntriesTable rows={rows} />
</div>
\`\`\`

## 部分的な上書き

トークンは独立しているので、変えたいものだけ定義すればよい。
\`typography\` は「個別トークン → スケール → 既定値」の順に解決するため、
どちらの粒度でも指定できる。

\`\`\`css
:root {
  /* スケールを変えると、それを使う文字スタイルがまとめて追従する */
  --openkk-font-size-base: 15px;

  /* 特定の文字スタイルだけを変えることもできる */
  --openkk-typography-page-title-font-size: 32px;
}
\`\`\`

## 注意

- 数値トークンの既定値は \`12px\` のように単位付き。上書きするときも単位を付ける。
- 帳票の印刷は別 document (iframe srcdoc) で描画されるため、ホストページの
  \`--openkk-*\` は継承されない。印刷物の見た目はこの仕組みの対象外。
- \`slateScale\` は元になる色スケールで、意味を持つトークンではないため var 化していない。
- 実値が必要な場合は \`tokenDefaults\` を参照する。

## 変数一覧

全 ${total} 個。

${tables}

## 製品アイコンと Fruit Colors

製品アイコンは \`rubydogjp/arts\` の \`doticons/rubydog.doticons\` で管理し、その配色は
\`colors/palettes.json\` の Fruit Colors（Material 400 / 600 / 900）を使う。
Rubydog 自体のブランドには Google 基本4色を使い、Fruit と区別する。

この文書の操作・成功・注意・エラーなどの意味付き UI テーマは Fruit とは独立している。
ライブラリの UI テーマの正本は引き続き \`packages/frontend-ui\` 内のテーマ定義で、ホストアプリは
既存の CSS 変数で上書きできる。今回のアイコン配色変更では、その値を変更しない。

同じ親ディレクトリに arts がある場合、\`node scripts/gen-icons.mjs --from-arts\` でアイコンの
配布用ソース \`resources/icons.json\` と SVG / PNG / favicon を更新する。
通常の \`npm run gen-icons\` / \`npm run check:icons\` はリポジトリ内の配布用ソースだけを読み、
OSS の利用者には arts の checkout を要求しない。`,
);

if (checkOnly) {
  if (readFileSync(outputPath, "utf8") !== markdown) {
    throw new Error("Generated theme documentation is stale: docs/theming.md");
  }
} else {
  writeFileSync(outputPath, markdown);
  console.log(
    `wrote ${path.relative(rootDirectory, outputPath)} (${total} variables)`,
  );
}
