import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { formatGenerated } from "./format-generated.mjs";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRelativePath = "resources/gen/master-sets";
const sourceDirectory = join(rootDirectory, sourceRelativePath);
const index = JSON.parse(
  readFileSync(join(sourceDirectory, "index.json"), "utf8"),
);
const checkOnly = process.argv.includes("--check");

const masterSets = readMasterSets(index);

const outputs = [
  {
    path: join(
      rootDirectory,
      "packages",
      "engine",
      "src",
      "domain",
      "generated-master-data.ts",
    ),
    source: buildTypescript(masterSets, {
      accountTypeName: "MasterBookAccountType",
      declareAccountType: true,
      header: "",
    }),
  },
  {
    path: join(
      rootDirectory,
      "packages",
      "driver",
      "src",
      "domain",
      "entries",
      "generated-master-data.ts",
    ),
    source: buildTypescript(masterSets, {
      accountTypeName: "BookAccountType",
      declareAccountType: false,
      header: 'import type { BookAccountType } from "./book-account.js";\n\n',
    }),
  },
];

const staleOutputs = [];
for (const output of outputs) {
  const source = await formatGenerated(output.path, output.source);
  if (checkOnly) {
    if (readFileSync(output.path, "utf8") !== source) {
      staleOutputs.push(relative(rootDirectory, output.path));
    }
  } else {
    writeFileSync(output.path, source);
  }
}

if (staleOutputs.length > 0) {
  throw new Error(`Generated master data is stale: ${staleOutputs.join(", ")}`);
}

if (!checkOnly) {
  for (const masterSet of masterSets) {
    console.log(
      `generated ${masterSet.id}: ${masterSet.catalog.bookAccounts.length} book accounts, ` +
        `${masterSet.catalog.taxCategories.length} tax categories, ` +
        `${masterSet.catalog.businessCategories.length} business categories`,
    );
  }
}

function readMasterSets(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("master sets index must be a non-empty array");
  }
  const seenSetIds = new Set();
  const kindById = new Map();
  let previousEffectiveFrom = "";
  return value.map((entry) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("master set entry must be an object");
    }
    requireNonBlankString(entry.id, "master set id");
    requireNonBlankString(entry.name, `master set name (${entry.id})`);
    requireNonBlankString(entry.file, `master set file (${entry.id})`);
    if (!/^[a-z0-9-]+$/.test(entry.id) || seenSetIds.has(entry.id)) {
      throw new Error(`master set id is invalid or repeated: ${entry.id}`);
    }
    seenSetIds.add(entry.id);
    if (
      typeof entry.effectiveFrom !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveFrom) ||
      entry.effectiveFrom <= previousEffectiveFrom
    ) {
      throw new Error(
        `master set effectiveFrom must be a date later than the previous set: ${entry.id}`,
      );
    }
    previousEffectiveFrom = entry.effectiveFrom;
    const catalog = JSON.parse(
      readFileSync(join(sourceDirectory, entry.file), "utf8"),
    );
    validateCatalog(catalog);
    for (const [kind, records] of [
      ["taxCategories", catalog.taxCategories],
      ["businessCategories", catalog.businessCategories],
      ["bookAccounts", catalog.bookAccounts],
    ]) {
      for (const record of records) {
        const known = kindById.get(record.id);
        if (known != null && known !== kind) {
          throw new Error(
            `id "${record.id}" is ${known} in one master set and ${kind} in another`,
          );
        }
        kindById.set(record.id, kind);
      }
    }
    return {
      id: entry.id,
      name: entry.name,
      effectiveFrom: entry.effectiveFrom,
      catalog,
    };
  });
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

  source +=
    "export type MasterSet = {\n" +
    "  id: string;\n  name: string;\n  effectiveFrom: string;\n" +
    "  bookAccounts: DefaultBookAccount[];\n" +
    "  taxCategories: DefaultTaxCategory[];\n" +
    "  businessCategories: DefaultBusinessCategory[];\n};\n\n";
  source += "export const MASTER_SETS: MasterSet[] = [\n";
  for (const masterSet of value) {
    source += "  {\n";
    source += `    id: ${quoted(masterSet.id)},\n`;
    source += `    name: ${quoted(masterSet.name)},\n`;
    source += `    effectiveFrom: ${quoted(masterSet.effectiveFrom)},\n`;
    source += "    bookAccounts: [\n";
    for (const account of masterSet.catalog.bookAccounts) {
      source += formatBookAccount(account);
    }
    source += "    ],\n    taxCategories: [\n";
    for (const category of masterSet.catalog.taxCategories) {
      source += `      { id: ${quoted(category.id)}, name: ${quoted(category.name)}, rate: ${category.rate} },\n`;
    }
    source += "    ],\n    businessCategories: [\n";
    for (const category of masterSet.catalog.businessCategories) {
      source += `      { id: ${quoted(category.id)}, name: ${quoted(category.name)} },\n`;
    }
    source += "    ],\n  },\n";
  }
  source += "];\n\n";
  source +=
    "export const FIRST_MASTER_SET_ID = MASTER_SETS[0]!.id;\n\n" +
    "export const LATEST_MASTER_SET = MASTER_SETS[MASTER_SETS.length - 1]!;\n\n" +
    "export const DEFAULT_BOOK_ACCOUNTS: DefaultBookAccount[] =\n  LATEST_MASTER_SET.bookAccounts;\n\n" +
    "export const DEFAULT_TAX_CATEGORIES: DefaultTaxCategory[] =\n  LATEST_MASTER_SET.taxCategories;\n\n" +
    "export const DEFAULT_BUSINESS_CATEGORIES: DefaultBusinessCategory[] =\n  LATEST_MASTER_SET.businessCategories;\n";
  return source;
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
