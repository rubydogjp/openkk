// 実行: npm run gen-master-data

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRel = "resources/gen/bookkeeping_master_data.json";

const data = JSON.parse(readFileSync(join(root, sourceRel), "utf8"));
validate(data);

writeFileSync(
  join(root, "packages", "server-domain", "src", "generated-master-data.ts"),
  buildTS(data, "MasterBookAccountType", "", true),
);
writeFileSync(
  join(root, "packages", "client-domain", "src", "entries", "generated-master-data.ts"),
  buildTS(
    data,
    "EntryAccountVisualType",
    'import type { EntryAccountVisualType } from "./entries-types";\n\n',
    false,
  ),
);

console.log(
  `generated ${data.bookAccounts.length} book accounts, ` +
    `${data.taxCategories.length} tax categories, ` +
    `${data.businessCategories.length} business categories`,
);

function validate(catalog) {
  const seen = new Map();
  const all = [
    ...catalog.taxCategories.map((x) => [x.id, "tax category"]),
    ...catalog.businessCategories.map((x) => [x.id, "business category"]),
    ...catalog.bookAccounts.map((x) => [x.id, "book account"]),
  ];
  for (const [id, kind] of all) {
    if (seen.has(id)) {
      throw new Error(`duplicate id "${id}" in ${seen.get(id)} and ${kind}`);
    }
    seen.set(id, kind);
  }
}

function tsStr(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildTS(catalog, accTypeName, header, declareAccType) {
  let b = "";
  b += `// Generated from ${sourceRel}. Do not edit directly.\n`;
  b += "// Regenerate: npm run gen-master-data\n\n";
  if (header) b += header;
  if (declareAccType) {
    b +=
      `export type ${accTypeName} =\n` +
      '  | "asset"\n  | "liability"\n  | "equity"\n' +
      '  | "revenue"\n  | "cost_of_sales"\n  | "expense";\n\n';
  }
  b += 'export type NormalBalanceSide = "debit" | "credit";\n\n';
  b +=
    "export type BalanceSheetSection =\n" +
    '  | "current_asset"\n  | "fixed_asset"\n  | "deferred_asset"\n' +
    '  | "current_liability"\n  | "long_term_liability"\n  | "equity"\n  | "none";\n\n';
  b +=
    "export type DefaultBookAccount = {\n" +
    "  id: string;\n  name: string;\n  description: string;\n  kana: string;\n" +
    `  normalBalanceSide: NormalBalanceSide;\n  accountType: ${accTypeName};\n` +
    "  balanceSheetSection: BalanceSheetSection;\n  sortOrder: number;\n};\n\n";
  b += "export type DefaultTaxCategory = { id: string; name: string; rate: number };\n";
  b += "export type DefaultBusinessCategory = { id: string; name: string };\n\n";

  b += "export const DEFAULT_BOOK_ACCOUNTS: DefaultBookAccount[] = [\n";
  for (const a of catalog.bookAccounts) {
    const bss = a.balanceSheetSection || "none";
    b +=
      `  { id: ${tsStr(a.id)}, name: ${tsStr(a.name)}, description: ${tsStr(a.description)}, ` +
      `kana: ${tsStr(a.kana)}, normalBalanceSide: ${tsStr(a.normalBalanceSide)}, ` +
      `accountType: ${tsStr(a.accountType)}, balanceSheetSection: ${tsStr(bss)}, ` +
      `sortOrder: ${a.sortOrder} },\n`;
  }
  b += "];\n\n";

  b += "export const DEFAULT_TAX_CATEGORIES: DefaultTaxCategory[] = [\n";
  for (const t of catalog.taxCategories) {
    b += `  { id: ${tsStr(t.id)}, name: ${tsStr(t.name)}, rate: ${t.rate} },\n`;
  }
  b += "];\n\n";

  b += "export const DEFAULT_BUSINESS_CATEGORIES: DefaultBusinessCategory[] = [\n";
  for (const c of catalog.businessCategories) {
    b += `  { id: ${tsStr(c.id)}, name: ${tsStr(c.name)} },\n`;
  }
  b += "];\n";
  return b;
}
