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
  exampleFixedAssetItems,
  buildBootstrapEntries,
  getEntryLines,
  sampleOpeningBalanceLines,
  type EntryRecord,
  type FixedAssetPreviewItem,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import type { MemoryDbSnapshot } from "@rubydogjp/openkk-memory-db-adapter";

export function buildOpenkkDemoSeed(config: OpenkkConfig): MemoryDbSnapshot {
  const fiscalPeriod = buildSeedFiscalPeriod(config);
  return {
    fiscalPeriods: [{ userId: config.mockUserId, record: fiscalPeriod }],
    entries: buildBootstrapEntries().map((record) =>
      entryRecordToApiRecord(record, fiscalPeriod.id),
    ),
    fixedAssets: exampleFixedAssetItems.map((item) =>
      fixedAssetItemToApiRecord(item, fiscalPeriod.id),
    ),
    closings: [],
  };
}

function buildSeedFiscalPeriod(config: OpenkkConfig): FiscalPeriodApiRecord {
  return {
    id: "fp-2026",
    name: "デモ期間2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    stage: "pre_opening",
    settingsCompleted: false,
    openingBalancesCompleted: false,
    documentsReceivedCompleted: false,
    opening: {
      id: "opening-fp-2026",
      userId: config.mockUserId,
      fiscalPeriodId: "fp-2026",
      openingBalanceLines: sampleOpeningBalanceLines,
      carryoverJournals: [],
    },
  };
}

function entryRecordToApiRecord(
  record: EntryRecord,
  fiscalPeriodId: string,
): EntryApiRecord {
  return {
    id: record.id,
    fiscalPeriodId,
    date: record.date,
    description: record.description,
    localId: record.localId ?? "",
    businessRate: parseBusinessRate(record.businessRate),
    lines: getEntryLines(record).map((line): EntryApiLine => ({
      side: line.side,
      bookAccountId:
        DEFAULT_BOOK_ACCOUNTS.find((account) => account.id === line.bookAccountId)
          ?.id ??
        findDefaultAccountByLegacyPcaId(line.bookAccountId)?.id ??
        DEFAULT_BOOK_ACCOUNTS.find(
          (account) =>
            account.name === line.accountName &&
            account.accountType === line.accountType,
        )?.id ??
        DEFAULT_BOOK_ACCOUNTS.find((account) => account.name === line.accountName)
          ?.id ??
        line.accountName,
      amount: parseAmount(line.amount),
      partnerName: record.partner,
      taxCategoryName:
        DEFAULT_TAX_CATEGORIES.find(
          (category) =>
            normalizeTaxCategoryText(category.name) ===
            normalizeTaxCategoryText(record.taxCategory),
        )?.id ?? record.taxCategory,
      businessCategoryName:
        DEFAULT_BUSINESS_CATEGORIES.find(
          (category) =>
            normalizeBusinessCategoryText(category.name) ===
            normalizeBusinessCategoryText(record.businessCategory),
        )?.id ?? record.businessCategory,
    })),
  };
}

function findDefaultAccountByLegacyPcaId(id: string | undefined) {
  if (id == null) return null;
  const match = id.match(/^acct_pca_(\d+)$/);
  if (match == null) return null;
  const sortOrder = Number(match[1]);
  if (!Number.isFinite(sortOrder)) return null;
  return DEFAULT_BOOK_ACCOUNTS.find((account) => account.sortOrder === sortOrder) ?? null;
}

function fixedAssetItemToApiRecord(
  item: FixedAssetPreviewItem,
  fiscalPeriodId: string,
): FixedAssetApiRecord {
  return {
    id: item.id,
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
      DEFAULT_BOOK_ACCOUNTS.find((account) => account.name === item.account)?.id ??
      item.accountId ??
      item.account,
  };
}

function normalizeTaxCategoryText(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function normalizeBusinessCategoryText(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const shortType = trimmed.match(/^第([1-6])種/)?.[1];
  return shortType == null ? trimmed : `第${shortType}種`;
}

function fixedAssetStatusToApi(
  status: string,
): FixedAssetApiRecord["status"] {
  if (status === "売却済") return "sold";
  if (status === "廃棄済") return "disposed";
  if (status === "完了") return "retired";
  return "active";
}
