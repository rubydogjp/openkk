import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RELEASE_TAG = "v26.3.1";
const OWNER_USER_ID = "openkk-original-user";
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "v26.3.1");

const releaseDir = process.argv[2];
if (releaseDir == null) {
  throw new Error(
    `usage: node make-v26.3.1-fixtures.mjs <folder with ${RELEASE_TAG} checked out, npm ci and npm run build:packages done>`,
  );
}

const fromRelease = (path) =>
  import(pathToFileURL(resolve(releaseDir, path)).href);

const { default: sqlite3InitModule } = await fromRelease(
  "node_modules/@sqlite.org/sqlite-wasm/node.mjs",
);
const { createSqliteDbAdapter, runMigrations } = await fromRelease(
  "packages/sqlite-adapter/dist/index.js",
);
const { createOpenkkEmbeddedBackend } = await fromRelease(
  "packages/embedded-backend/dist/index.js",
);
const { createOpenkkEmbeddedBackendAdapter } = await fromRelease(
  "packages/embedded-backend-adapter/dist/index.js",
);
const { buildExpectedClosingEntries } = await fromRelease(
  "packages/server-domain/dist/index.js",
);
const {
  archiveClosingRecords,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
} = await fromRelease("packages/client-domain/dist/index.js");

const sqlite3 = await sqlite3InitModule({
  print: () => {},
  printErr: (message) => console.error("[sqlite-wasm]", message),
});

async function openReleaseDatabase() {
  const database = new sqlite3.oo1.DB(":memory:");
  runMigrations(database);
  const db = await createSqliteDbAdapter(
    { exec: async (arg) => database.exec(arg) },
    null,
  );
  const server = createOpenkkEmbeddedBackend(db, { userId: OWNER_USER_ID });
  const backend = createOpenkkEmbeddedBackendAdapter(server);
  return { database, db, backend };
}

function exportDatabaseBytes(database) {
  return sqlite3.capi.sqlite3_js_db_export(database.pointer);
}

const master = await (async () => {
  const { database, backend } = await openReleaseDatabase();
  const accounts = await backend.masterData.getBookAccounts();
  const taxCategories = await backend.masterData.getTaxCategories();
  const businessCategories = await backend.masterData.getBusinessCategories();
  database.close();
  return { accounts, taxCategories, businessCategories };
})();

function accountId(name, accountType) {
  const found = master.accounts.filter(
    (account) =>
      account.name === name &&
      (accountType == null || account.accountType === accountType),
  );
  if (found.length === 0) throw new Error(`no account named ${name}`);
  return found[0].id;
}

function categoryId(list, name) {
  const found = list.find((category) => category.name === name);
  if (found == null) throw new Error(`no category named ${name}`);
  return found.id;
}

const TAX_SALES_10 = categoryId(master.taxCategories, "課税 10%");
const TAX_OUT_OF_SCOPE = categoryId(master.taxCategories, "対象外");
const BUSINESS_SERVICE = categoryId(
  master.businessCategories,
  "第5種（サービス業等）",
);
const BUSINESS_NONE = categoryId(master.businessCategories, "対象外");

function line(side, name, amount, extra) {
  return {
    side,
    bookAccountId: accountId(name, extra?.accountType ?? null),
    amount,
    partnerName: extra?.partnerName ?? "",
    taxCategoryId: extra?.taxCategoryId ?? TAX_OUT_OF_SCOPE,
    businessCategoryId: extra?.businessCategoryId ?? BUSINESS_NONE,
  };
}

function entry(date, description, lines, options) {
  return {
    date,
    description,
    localId: options?.localId ?? null,
    businessRate: options?.businessRate ?? 1,
    lines,
  };
}

const LONG_DESCRIPTION =
  "長い摘要のための文章です。".repeat(30).slice(0, 380) + "（終）";

async function startWithOpening(backend, periodId, balanceLines) {
  await backend.fiscalPeriods.start(periodId);
  return backend.fiscalPeriods.patch(periodId, {
    openingBalancesCompleted: true,
    opening: { balanceLines, journals: [] },
  });
}

async function closePeriod(backend, periodId) {
  await backend.preClosings.run(periodId);
  const period = (await backend.fiscalPeriods.getAll()).find(
    (candidate) => candidate.id === periodId,
  );
  const closingEntries = buildExpectedClosingEntries({
    periodStartDate: period.startDate,
    periodEndDate: period.endDate,
    entries: await backend.entries.getAll(periodId),
    fixedAssets: await backend.fixedAssets.getAll(periodId),
    openingJournals: period.opening.journals,
    bookAccounts: master.accounts,
  });
  await backend.closings.run(periodId, closingEntries);
  return backend.fiscalPeriods.patch(periodId, {
    documentsReceivedCompleted: true,
  });
}

async function archiveZipOf(backend, periodId, createdAt) {
  const fiscalPeriod = (await backend.fiscalPeriods.getAll()).find(
    (period) => period.id === periodId,
  );
  const [entries, fixedAssets] = await Promise.all([
    backend.entries.getAll(periodId),
    backend.fixedAssets.getAll(periodId),
  ]);
  return createFiscalPeriodArchiveZip(
    buildFiscalPeriodArchivePayload({
      createdAt,
      fiscalPeriod: { ...fiscalPeriod, archiveStatus: "archived" },
      entries: entries.map((record) => ({ ...record })),
      fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
      closings: archiveClosingRecords(fiscalPeriod),
    }),
  );
}

const { database, db, backend } = await openReleaseDatabase();

const year2021 = await backend.fiscalPeriods.create({
  name: "2021年分",
  startDate: "2021-01-01",
  endDate: "2021-12-31",
});
await startWithOpening(backend, year2021.id, [
  { id: "a:現金", accountId: "a:現金", amount: 50000 },
  { id: "l:元入金", accountId: "l:元入金", amount: 50000 },
]);
await backend.entries.create(
  year2021.id,
  entry("2021-06-01", "2021年の売上", [
    line("debit", "現金", 30000),
    line("credit", "売上", 30000, { taxCategoryId: TAX_SALES_10 }),
  ]),
);
await closePeriod(backend, year2021.id);
await backend.fiscalPeriods.archive(year2021.id);
await backend.fiscalPeriods.purgeArchivedData(year2021.id);

const year2023 = await backend.fiscalPeriods.create({
  name: "2023年分",
  startDate: "2023-01-01",
  endDate: "2023-12-31",
});
await startWithOpening(backend, year2023.id, [
  { id: "a:現金", accountId: "a:現金", amount: 120000 },
  { id: "a:その他の預金", accountId: "a:その他の預金", amount: 800000 },
  { id: "a:普通預金", accountId: "a:普通預金", amount: 300000 },
  { id: "l:元入金", accountId: "l:元入金", amount: 1220000 },
]);
const salesPartner = {
  partnerName: "サンプル商店",
  taxCategoryId: TAX_SALES_10,
  businessCategoryId: BUSINESS_SERVICE,
};
await backend.entries.create(
  year2023.id,
  entry("2023-03-10", "制作の売上 (3 月分)", [
    line("debit", "普通預金", 330000, salesPartner),
    line("credit", "売上", 330000, salesPartner),
  ]),
);
await backend.entries.create(
  year2023.id,
  entry(
    "2023-04-02",
    "機材と配送をまとめて支払い",
    [
      line("debit", "消耗品費", 44000),
      line("debit", "荷造運賃", 6000),
      line("credit", "普通預金", 50000),
    ],
    { businessRate: 0.8 },
  ),
);
await backend.entries.create(
  year2023.id,
  entry("2023-12-20", "年末の外注費 (未払)", [
    line("debit", "外注費", 70000, { partnerName: "デザイン事務所" }),
    line("credit", "未払金", 70000, { partnerName: "デザイン事務所" }),
  ]),
);
await backend.fixedAssets.create(year2023.id, {
  name: "ノートパソコン",
  acquisitionDate: "2023-02-15",
  acquisitionCost: 240000,
  usefulLife: 4,
  depreciationMethod: "straight_line",
  businessRate: 0.8,
  bookAccountId: accountId("工具器具備品", "asset"),
});
const camera = await backend.fixedAssets.create(year2023.id, {
  name: "カメラ",
  acquisitionDate: "2023-01-05",
  acquisitionCost: 300000,
  usefulLife: 5,
  depreciationMethod: "straight_line",
  businessRate: 1,
  bookAccountId: accountId("工具器具備品", "asset"),
});
const desk = await backend.fixedAssets.create(year2023.id, {
  name: "デスク",
  acquisitionDate: "2023-01-20",
  acquisitionCost: 150000,
  usefulLife: 8,
  depreciationMethod: "straight_line",
  businessRate: 1,
  bookAccountId: accountId("工具器具備品", "asset"),
});
await backend.fixedAssets.patch(year2023.id, camera.id, {
  status: "sold",
  disposalDate: "2023-11-30",
  disposalPrice: 200000,
});
await backend.fixedAssets.patch(year2023.id, desk.id, {
  status: "disposed",
  disposalDate: "2023-10-31",
  disposalPrice: null,
});
await closePeriod(backend, year2023.id);

const year2023Entries = await backend.entries.getAll(year2023.id);
const unpaidOutsourcing = year2023Entries.find(
  (record) => record.description === "年末の外注費 (未払)",
);
const year2024 = await backend.fiscalPeriods.createNext({
  sourceFiscalPeriodId: year2023.id,
  name: "2024年分",
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  carryBalances: true,
  reversalEntryIds: [unpaidOutsourcing.id],
  carryFixedAssets: true,
});
const year2023Zip = await archiveZipOf(
  backend,
  year2023.id,
  "2024-01-15T09:00:00.000Z",
);
await backend.fiscalPeriods.archive(year2023.id);
await backend.fiscalPeriods.importArchived(
  readFiscalPeriodArchiveZip(year2023Zip),
);

await backend.fiscalPeriods.start(year2024.id);
await backend.fiscalPeriods.patch(year2024.id, {
  openingBalancesCompleted: true,
});
for (let index = 1; index <= 6; index += 1) {
  await backend.entries.create(
    year2024.id,
    entry(
      "2024-05-10",
      index === 3 ? LONG_DESCRIPTION : `同じ日の仕訳 ${index}`,
      [
        line("debit", "通信費", 1000 * index, {
          partnerName: `取引先${index}`,
        }),
        line("credit", "現金", 1000 * index, { partnerName: `取引先${index}` }),
      ],
      { businessRate: index % 2 === 0 ? 0.8 : 1 },
    ),
  );
}
await backend.entries.create(
  year2024.id,
  entry(
    "2024-07-01",
    "家賃 (自宅兼事務所)",
    [line("debit", "地代家賃", 100000), line("credit", "普通預金", 100000)],
    { businessRate: 0.5 },
  ),
);
await backend.entries.importMany(year2024.id, [
  entry(
    "2024-08-31",
    "まとめて取り込んだ仕訳 A",
    [line("debit", "旅費交通費", 2500), line("credit", "現金", 2500)],
    { localId: "import-a" },
  ),
  entry(
    "2024-08-31",
    "まとめて取り込んだ仕訳 B",
    [line("debit", "旅費交通費", 3500), line("credit", "現金", 3500)],
    { localId: "import-b" },
  ),
  entry(
    "2024-08-31",
    "まとめて取り込んだ仕訳 C",
    [line("debit", "旅費交通費", 4500), line("credit", "現金", 4500)],
    { localId: "import-c" },
  ),
]);
await closePeriod(backend, year2024.id);

const year2025 = await backend.fiscalPeriods.createNext({
  sourceFiscalPeriodId: year2024.id,
  name: "2025年分",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  carryBalances: true,
  reversalEntryIds: [],
  carryFixedAssets: true,
});
await backend.fiscalPeriods.start(year2025.id);
await backend.fiscalPeriods.patch(year2025.id, {
  openingBalancesCompleted: true,
});
await backend.entries.create(
  year2025.id,
  entry("2025-02-03", "記帳中の期間の売上", [
    line("debit", "売掛金", 55000, salesPartner),
    line("credit", "売上", 55000, salesPartner),
  ]),
);
await backend.entries.create(
  year2025.id,
  entry("2025-02-28", "売掛金の入金", [
    line("debit", "普通預金", 55000, { partnerName: "サンプル商店" }),
    line("credit", "売掛金", 55000, { partnerName: "サンプル商店" }),
  ]),
);

await backend.fiscalPeriods.create({
  name: "2027年分",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
});

const year2024Zip = await archiveZipOf(
  backend,
  year2024.id,
  "2025-01-20T09:00:00.000Z",
);
const year2025Zip = await archiveZipOf(
  backend,
  year2025.id,
  "2025-03-01T09:00:00.000Z",
);

async function readReleaseRecords(port) {
  const periods = await port.fiscalPeriods.getAll(OWNER_USER_ID);
  const records = [];
  for (const fiscalPeriod of periods) {
    if (fiscalPeriod.archiveStatus === "purged") {
      records.push({ fiscalPeriod, entries: [], fixedAssets: [] });
      continue;
    }
    records.push({
      fiscalPeriod,
      entries: await port.entries.getAll(fiscalPeriod.id),
      fixedAssets: await port.fixedAssets.getAll(fiscalPeriod.id),
    });
  }
  return records;
}

const databaseRecords = (await readReleaseRecords(db)).map((record) => ({
  ...record,
  entryIdsInStoredOrder: database.selectValues(
    "SELECT id FROM entries WHERE fiscal_period_id = ? ORDER BY rowid",
    [record.fiscalPeriod.id],
  ),
  fixedAssetIdsInStoredOrder: database.selectValues(
    "SELECT id FROM fixed_assets WHERE fiscal_period_id = ? ORDER BY rowid",
    [record.fiscalPeriod.id],
  ),
}));
const databaseBytes = exportDatabaseBytes(database);
const schemaVersion = database.selectValue(
  "SELECT value FROM openkk_meta WHERE key = 'schema_version'",
);
database.close();

async function importedByRelease(zip) {
  const target = await openReleaseDatabase();
  await target.backend.fiscalPeriods.importArchived(
    readFiscalPeriodArchiveZip(zip),
  );
  const [record] = await readReleaseRecords(target.db);
  target.database.close();
  return record;
}

const zips = {
  "archive-2023-closed.zip": year2023Zip,
  "archive-2024-closed.zip": year2024Zip,
  "archive-2025-journalizing.zip": year2025Zip,
};
const zipRecords = {};
for (const [name, bytes] of Object.entries(zips)) {
  zipRecords[name] = await importedByRelease(bytes);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, "openkk.sqlite3"), databaseBytes);
for (const [name, bytes] of Object.entries(zips)) {
  writeFileSync(join(OUTPUT_DIR, name), bytes);
}
writeFileSync(
  join(OUTPUT_DIR, "expected.json"),
  `${JSON.stringify(
    {
      madeBy: RELEASE_TAG,
      userId: OWNER_USER_ID,
      schemaVersion,
      database: databaseRecords,
      zips: zipRecords,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `wrote ${OUTPUT_DIR}: database ${databaseBytes.byteLength} bytes (schema ${schemaVersion}), ${databaseRecords.length} periods, ${Object.keys(zips).length} zips`,
);
