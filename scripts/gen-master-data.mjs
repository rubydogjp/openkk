import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRelativePath = "resources/gen/bookkeeping_master_data.json";
const sourcePath = join(root, sourceRelativePath);
const catalog = JSON.parse(readFileSync(sourcePath, "utf8"));
const checkOnly = process.argv.includes("--check");

validateCatalog(catalog);

const outputs = [
  {
    path: join(root, "packages", "server-domain", "src", "generated-master-data.ts"),
    source: buildTypescript(catalog, {
      accountTypeName: "MasterBookAccountType",
      declareAccountType: true,
      header: "",
    }),
  },
  {
    path: join(
      root,
      "packages",
      "client-domain",
      "src",
      "entries",
      "generated-master-data.ts",
    ),
    source: buildTypescript(catalog, {
      accountTypeName: "EntryAccountVisualType",
      declareAccountType: false,
      header:
        'import type { EntryAccountVisualType } from "./entries-types.js";\n\n',
    }),
  },
];

const staleOutputs = [];
for (const output of outputs) {
  if (checkOnly) {
    if (readFileSync(output.path, "utf8") !== output.source) {
      staleOutputs.push(relative(root, output.path));
    }
  } else {
    writeFileSync(output.path, output.source);
  }
}

if (staleOutputs.length > 0) {
  throw new Error(
    `Generated master data is stale: ${staleOutputs.join(", ")}`,
  );
}

if (!checkOnly) {
  console.log(
    `generated ${catalog.bookAccounts.length} book accounts, ` +
      `${catalog.taxCategories.length} tax categories, ` +
      `${catalog.businessCategories.length} business categories`,
  );
}

function validateCatalog(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("master data must be an object");
  }
  const collections = [
    ["taxCategories", value.taxCategories],
    ["businessCategories", value.businessCategories],
    ["bookAccounts", value.bookAccounts],
  ];
  for (const [name, collection] of collections) {
    if (!Array.isArray(collection)) {
      throw new Error(`${name} must be an array`);
    }
  }

  const seenIds = new Map();
  for (const [kind, records] of collections) {
    for (const record of records) {
      if (
        record == null ||
        typeof record !== "object" ||
        Array.isArray(record)
      ) {
        throw new Error(`${kind} record must be an object`);
      }
      requireNonBlankString(record.id, `${kind} id`);
      requireNonBlankString(record.name, `${kind} name`);
      if (seenIds.has(record.id)) {
        throw new Error(
          `duplicate id "${record.id}" in ${seenIds.get(record.id)} and ${kind}`,
        );
      }
      seenIds.set(record.id, kind);
    }
  }

  const accountTypes = new Set([
    "asset",
    "liability",
    "equity",
    "revenue",
    "cost_of_sales",
    "expense",
  ]);
  const balanceSides = new Set(["debit", "credit"]);
  const balanceSheetSections = new Set([
    "current_asset",
    "fixed_asset",
    "deferred_asset",
    "current_liability",
    "long_term_liability",
    "equity",
    "none",
    "",
  ]);
  const sortOrders = new Set();
  for (const account of value.bookAccounts) {
    requireNonBlankString(
      account.description,
      `book account description (${account.id})`,
    );
    if (typeof account.kana !== "string") {
      throw new Error(`book account kana is invalid: ${account.id}`);
    }
    if (!accountTypes.has(account.accountType)) {
      throw new Error(`book account type is invalid: ${account.id}`);
    }
    if (!balanceSides.has(account.normalBalanceSide)) {
      throw new Error(`normal balance side is invalid: ${account.id}`);
    }
    if (
      typeof account.balanceSheetSection !== "string" ||
      !balanceSheetSections.has(account.balanceSheetSection)
    ) {
      throw new Error(`balance sheet section is invalid: ${account.id}`);
    }
    if (
      !Number.isSafeInteger(account.sortOrder) ||
      account.sortOrder < 0 ||
      sortOrders.has(account.sortOrder)
    ) {
      throw new Error(`book account sort order is invalid: ${account.id}`);
    }
    sortOrders.add(account.sortOrder);
  }
  for (const category of value.taxCategories) {
    if (
      !Number.isSafeInteger(category.rate) ||
      category.rate < 0 ||
      category.rate > 10_000
    ) {
      throw new Error(`tax category rate is invalid: ${category.id}`);
    }
  }
}

function requireNonBlankString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-blank string`);
  }
}

function quoted(value) {
  return JSON.stringify(String(value));
}

function buildTypescript(
  value,
  { accountTypeName, declareAccountType, header },
) {
  let source =
    `// Generated from ${sourceRelativePath}. Do not edit directly.\n` +
    "// Regenerate: npm run gen-master-data\n\n" +
    header;
  if (declareAccountType) {
    source +=
      `export type ${accountTypeName} =\n` +
      '  | "asset"\n  | "liability"\n  | "equity"\n' +
      '  | "revenue"\n  | "cost_of_sales"\n  | "expense";\n\n';
  }
  source += 'export type NormalBalanceSide = "debit" | "credit";\n\n';
  source +=
    "export type BalanceSheetSection =\n" +
    '  | "current_asset"\n  | "fixed_asset"\n  | "deferred_asset"\n' +
    '  | "current_liability"\n  | "long_term_liability"\n  | "equity"\n  | "none";\n\n';
  source +=
    "export type DefaultBookAccount = {\n" +
    "  id: string;\n  name: string;\n  description: string;\n  kana: string;\n" +
    `  normalBalanceSide: NormalBalanceSide;\n  accountType: ${accountTypeName};\n` +
    "  balanceSheetSection: BalanceSheetSection;\n  sortOrder: number;\n};\n\n";
  source +=
    "export type DefaultTaxCategory = { id: string; name: string; rate: number };\n" +
    "export type DefaultBusinessCategory = { id: string; name: string };\n\n";

  source += "export const DEFAULT_BOOK_ACCOUNTS: DefaultBookAccount[] = [\n";
  for (const account of value.bookAccounts) {
    source += formatBookAccount(account);
  }
  source += "];\n\n";

  source += "export const DEFAULT_TAX_CATEGORIES: DefaultTaxCategory[] = [\n";
  for (const category of value.taxCategories) {
    source +=
      `  { id: ${quoted(category.id)}, name: ${quoted(category.name)}, rate: ${category.rate} },\n`;
  }
  source += "];\n\n";

  source +=
    "export const DEFAULT_BUSINESS_CATEGORIES: DefaultBusinessCategory[] = [\n";
  for (const category of value.businessCategories) {
    source +=
      `  { id: ${quoted(category.id)}, name: ${quoted(category.name)} },\n`;
  }
  return source + "];\n";
}

function formatBookAccount(account) {
  const balanceSheetSection =
    account.balanceSheetSection === "" ? "none" : account.balanceSheetSection;
  return (
    "  {\n" +
    `    id: ${quoted(account.id)},\n` +
    `    name: ${quoted(account.name)},\n` +
    `    description: ${quoted(account.description)},\n` +
    `    kana: ${quoted(account.kana)},\n` +
    `    normalBalanceSide: ${quoted(account.normalBalanceSide)},\n` +
    `    accountType: ${quoted(account.accountType)},\n` +
    `    balanceSheetSection: ${quoted(balanceSheetSection)},\n` +
    `    sortOrder: ${account.sortOrder},\n` +
    "  },\n"
  );
}
