import type {
  EntryApiLine,
  EntryApiRecord,
  FiscalPeriodApiRecord,
  FixedAssetApiRecord,
} from "@rubydogjp/openkk-client";
import {
  parseAmount,
  parseBusinessRate,
  DEFAULT_BOOK_ACCOUNTS,
  DEFAULT_BUSINESS_CATEGORIES,
  DEFAULT_TAX_CATEGORIES,
  getEntryLines,
  bootstrapOpeningBalanceLines,
  type EntryRecord,
  type FixedAssetPreviewItem,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import type { MemoryDbSnapshot } from "@rubydogjp/openkk-memory-db-adapter";

import { buildDemoEntries, demoFixedAssetItems } from "./demo-content";

const DEMO_SEED_TIMESTAMP = new Date(0).toISOString();

export function buildOpenkkDemoSeed(config: OpenkkConfig): MemoryDbSnapshot {
  const fiscalPeriod = buildDemoSeedFiscalPeriod(config);
  return {
    fiscalPeriods: [{ userId: config.mockUserId, record: fiscalPeriod }],
    entries: buildDemoEntries().map((record) =>
      entryRecordToApiRecord(record, fiscalPeriod.id, config.mockUserId),
    ),
    fixedAssets: demoFixedAssetItems.map((item) =>
      fixedAssetItemToApiRecord(item, fiscalPeriod.id, config.mockUserId),
    ),
    closings: [],
  };
}

function buildDemoSeedFiscalPeriod(
  config: OpenkkConfig,
): FiscalPeriodApiRecord {
  return {
    id: "fp-2026",
    userId: config.mockUserId,
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
      userId: config.mockUserId,
      fiscalPeriodId: "fp-2026",
      createdAt: DEMO_SEED_TIMESTAMP,
      updatedAt: DEMO_SEED_TIMESTAMP,
      openingBalanceLines: bootstrapOpeningBalanceLines,
      openingJournals: [],
    },
    createdAt: DEMO_SEED_TIMESTAMP,
    updatedAt: DEMO_SEED_TIMESTAMP,
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
    localId: record.localId ?? "",
    businessRate: parseBusinessRate(record.businessRate),
    lines: getEntryLines(record).map(
      (line, index): EntryApiLine => ({
        id: `${record.id}-line-${index}`,
        side: line.side,
        bookAccountId:
          DEFAULT_BOOK_ACCOUNTS.find(
            (account) => account.id === line.bookAccountId,
          )?.id ??
          DEFAULT_BOOK_ACCOUNTS.find(
            (account) =>
              account.name === line.accountName &&
              account.accountType === line.accountType,
          )?.id ??
          DEFAULT_BOOK_ACCOUNTS.find(
            (account) => account.name === line.accountName,
          )?.id ??
          line.accountName,
        amount: parseAmount(line.amount),
        partnerName: record.partner,
        taxCategoryId:
          DEFAULT_TAX_CATEGORIES.find(
            (category) => category.name === record.taxCategory,
          )?.id ?? record.taxCategory,
        businessCategoryId:
          DEFAULT_BUSINESS_CATEGORIES.find(
            (category) => category.name === record.businessCategory,
          )?.id ?? record.businessCategory,
      }),
    ),
    createdAt: DEMO_SEED_TIMESTAMP,
    updatedAt: DEMO_SEED_TIMESTAMP,
  };
}

function fixedAssetItemToApiRecord(
  item: FixedAssetPreviewItem,
  fiscalPeriodId: string,
  userId: string,
): FixedAssetApiRecord {
  return {
    id: item.id,
    userId,
    fiscalPeriodId,
    name: item.name,
    acquisitionDate: item.acquisitionDate ?? "",
    acquisitionCost: parseAmount(item.purchase),
    usefulLife: item.usefulLife ?? 0,
    depreciationMethod: "straight_line",
    businessRate: item.businessRate ?? 1,
    status: fixedAssetStatusToApi(item.status),
    disposalDate: item.disposalDate ?? "",
    disposalPrice: parseAmount(item.disposalPrice ?? "0"),
    bookAccountId:
      DEFAULT_BOOK_ACCOUNTS.find((account) => account.name === item.account)
        ?.id ??
      item.accountId ??
      item.account,
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
