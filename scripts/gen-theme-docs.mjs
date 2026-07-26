#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tokensPath = path.join(
  root,
  "packages/client-ui/src/shared/design-tokens.ts",
);
const outFile = path.join(root, "docs", "theming.md");

const work = mkdtempSync(path.join(tmpdir(), "openkk-theme-docs-"));
const bundle = path.join(work, "design-tokens.mjs");

execFileSync(
  path.join(root, "node_modules/.bin/esbuild"),
  [tokensPath, "--bundle", "--format=esm", `--outfile=${bundle}`, "--log-level=error"],
  { cwd: root },
);

const tokens = await import(pathToFileURL(bundle).href);

rmSync(work, { recursive: true, force: true });

const parseVar = (value) => {
  const m = /^var\((--openkk-[a-z0-9-]+),\s*([\s\S]+)\)$/.exec(value);
  return m ? { name: m[1], fallback: m[2] } : null;
};

const flat = [
  ["色 (palette)", tokens.palette, "palette"],
  ["影 (shadows)", tokens.shadows, "shadows"],
  ["フォーカスリング (rings)", tokens.rings, "rings"],
  ["フォントサイズ (fontSize)", tokens.fontSize, "fontSize"],
  ["フォントウェイト (fontWeight)", tokens.fontWeight, "fontWeight"],
  ["フォントファミリー (fontFamily)", tokens.fontFamily, "fontFamily"],
  ["余白 (spacing)", tokens.spacing, "spacing"],
  ["角丸 (radii)", tokens.radii, "radii"],
];

const groups = flat.map(([label, group, key]) => ({
  label,
  entries: Object.entries(group)
    .map(([k, v]) => ({ key: `${key}.${k}`, ...parseVar(v) }))
    .filter((e) => e.name),
}));

groups.push({
  label: "寸法 (sizes)",
  entries: Object.entries(tokens.sizes).flatMap(([sub, group]) =>
    Object.entries(group)
      .map(([k, v]) => ({ key: `sizes.${sub}.${k}`, ...parseVar(v) }))
      .filter((e) => e.name),
  ),
});

groups.push({
  label: "文字スタイル (typography)",
  entries: Object.entries(tokens.typography).flatMap(([token, style]) =>
    Object.entries(style)
      .map(([prop, v]) => ({ key: `typography.${token}.${prop}`, ...parseVar(v) }))
      .filter((e) => e.name),
  ),
});

const total = groups.reduce((n, g) => n + g.entries.length, 0);

const esc = (s) => s.replace(/\|/g, "\\|");

const tables = groups
  .map(
    ({ label, entries }) => `### ${label}

| CSS 変数 | トークン | 既定値 |
| --- | --- | --- |
${entries
  .map((e) => `| \`${e.name}\` | \`${e.key}\` | \`${esc(e.fallback)}\` |`)
  .join("\n")}
`,
  )
  .join("\n");

const md = `<!-- npm run gen-theme-docs で生成。直接編集しない。 -->

# テーマの差し替え

\`@rubydogjp/openkk-client-ui\` のデザイントークンは CSS custom property
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

${tables}`;

writeFileSync(outFile, md);
console.log(`wrote ${path.relative(root, outFile)} (${total} variables)`);
