import type {
  EntryApiLine,
  EntryApiRecord,
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
} from "@rubydogjp/openkk-client";
import {
  parseAmount,
  resolveBookAccountId,
  resolveCategoryId,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  type EntryRecord,
  type FixedAsset,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import type { DbSnapshot } from "@rubydogjp/openkk-memory-db-adapter";

import {
  buildDemoEntries,
  demoFixedAssetItems,
  demoOpeningBalanceLines,
} from "./demo-content";

const DEMO_SEED_TIMESTAMP = new Date(0).toISOString();

export function buildOpenkkDemoSeed(config: OpenkkConfig): DbSnapshot {
  const fiscalPeriod = buildDemoSeedFiscalPeriod(config);
  return {
    fiscalPeriods: [fiscalPeriod],
    entries: buildDemoEntries().map((record) =>
      entryRecordToApiRecord(record, fiscalPeriod.id, fiscalPeriod.userId),
    ),
    fixedAssets: demoFixedAssetItems.map((item) =>
      fixedAssetItemToApiRecord(item, fiscalPeriod.id, fiscalPeriod.userId),
    ),
    closings: [],
    preClosings: [],
  };
}

function buildDemoSeedFiscalPeriod(
  config: OpenkkConfig,
): FiscalPeriodApiRecord {
  return {
    id: "fp-2026",
    userId: config.embeddedUser.id,
    name: "デモ期間2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    phase: "pre_opening",
    archiveStatus: "active",
    settingsCompleted: false,
    openingBalancesCompleted: false,
    documentsReceivedCompleted: false,
    opening: {
      id: "opening-fp-2026",
      userId: config.embeddedUser.id,
      fiscalPeriodId: "fp-2026",
      createdAt: DEMO_SEED_TIMESTAMP,
      updatedAt: DEMO_SEED_TIMESTAMP,
      openingBalanceLines: demoOpeningBalanceLines,
      openingJournals: [],
    },
    createdAt: DEMO_SEED_TIMESTAMP,
    updatedAt: DEMO_SEED_TIMESTAMP,
    archiveDataAvailable: true,
    archivedAt: null,
  };
}

function entryRecordToApiRecord(
  record: EntryRecord,
  fiscalPeriodId: string,
  userId: string,
): EntryApiRecord {
  return {
    id: record.id,
    userId,
    fiscalPeriodId,
    date: record.date,
    description: record.description,
    localId: record.localId,
    businessRate: record.businessRate,
    lines: record.lines.map((line, index): EntryApiLine => {
      const bookAccountId = resolveBookAccountId({
        explicitId: line.bookAccountId,
        accountName: line.accountName,
        accountType: line.accountType,
        accounts: DEFAULT_BOOK_ACCOUNTS,
      });
      if (bookAccountId == null) {
        throw new Error("Unknown demo book account: " + line.accountName);
      }
      return {
        id: `${record.id}-line-${index}`,
        side: line.side,
        bookAccountId,
        amount: parseAmount(line.amount),
        partnerName: line.partnerName ?? "",
        taxCategoryId: resolveCategoryId(
          line.taxCategoryId,
          line.taxCategoryName ?? "",
          DEFAULT_TAX_CATEGORIES,
          "tax_out_of_scope",
        ),
        businessCategoryId: resolveCategoryId(
          line.businessCategoryId,
          line.businessCategoryName ?? "",
          DEFAULT_BUSINESS_CATEGORIES,
          "biz_none",
        ),
      };
    }),
    createdAt: DEMO_SEED_TIMESTAMP,
    updatedAt: DEMO_SEED_TIMESTAMP,
  };
}

function fixedAssetItemToApiRecord(
  item: FixedAsset,
  fiscalPeriodId: string,
  userId: string,
): FixedAssetApiRecord {
  return {
    id: item.id,
    userId,
    fiscalPeriodId,
    name: item.name,
    acquisitionDate: item.acquisitionDate,
    acquisitionCost: item.acquisitionCost,
    usefulLife: item.usefulLife,
    depreciationMethod: "straight_line",
    businessRate: item.businessRate,
    status: fixedAssetStatusToApi(item.status),
    disposalDate: item.disposalDate,
    disposalPrice: item.disposalPrice,
    bookAccountId: item.bookAccountId,
    createdAt: DEMO_SEED_TIMESTAMP,
    updatedAt: DEMO_SEED_TIMESTAMP,
  };
}

function fixedAssetStatusToApi(status: string): FixedAssetApiRecord["status"] {
  if (status === "売却済") return "sold";
  if (status === "廃棄済") return "disposed";
  if (status === "完了") return "retired";
  return "active";
}
