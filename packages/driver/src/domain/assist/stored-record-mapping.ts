import { formatAmount, parseIsoLocalDate } from "../shared/parse-utils.js";
import type { BookAccountType } from "../entries/book-account.js";
import { computeStraightLineDepreciation } from "./fixed-asset-depreciation.js";
import type { FixedAsset, FixedAssetStatus } from "./fixed-asset-data.js";
import type { OpeningCarryoverRecord } from "./opening-carryover.js";

export type StoredOpeningJournal = {
  id: string;
  date: string;
  description: string;
  businessRate: number;
  lines: ReadonlyArray<{
    id: string;
    side: "debit" | "credit";
    bookAccountId: string;
    amount: number;
    partnerName: string;
    taxCategoryId: string;
    businessCategoryId: string;
  }>;
};

export type StoredFixedAsset = {
  id: string;
  fiscalPeriodId: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessRate: number;
  status: FixedAssetStatus;
  disposalDate: string | null;
  disposalPrice: number | null;
  bookAccountId: string;
};

export function mapOpeningJournalToRecord(
  journal: StoredOpeningJournal,
  fiscalPeriodId: string,
  accountNameById: Record<string, string>,
  accountTypeById: Record<string, BookAccountType>,
  taxCategoryNameById: Record<string, string>,
  businessCategoryNameById: Record<string, string>,
): OpeningCarryoverRecord {
  const lines = journal.lines.map((line) => ({
    id: line.id,
    side: line.side,
    accountName: accountNameById[line.bookAccountId] ?? line.bookAccountId,
    accountType: accountTypeById[line.bookAccountId] ?? "asset",
    amount: formatAmount(Math.abs(line.amount)),
    bookAccountId: line.bookAccountId,
    partnerName: line.partnerName,
    taxCategoryId: line.taxCategoryId,
    taxCategoryName:
      taxCategoryNameById[line.taxCategoryId] ?? line.taxCategoryId,
    businessCategoryId: line.businessCategoryId,
    businessCategoryName:
      businessCategoryNameById[line.businessCategoryId] ??
      line.businessCategoryId,
  }));
  return {
    id: journal.id,
    fiscalPeriodId,
    date: journal.date,
    description: journal.description,
    businessRate: journal.businessRate,
    lines,
  };
}

export function mapFixedAsset(
  asset: StoredFixedAsset,
  accountName: string | null,
  previewAsOf: Date,
  fiscalPeriodEndDate: string | null,
): FixedAsset {
  const isClosed = asset.status !== "active";
  const asOf =
    asset.status === "retired" && fiscalPeriodEndDate != null
      ? (parseIsoLocalDate(fiscalPeriodEndDate) ?? previewAsOf)
      : isClosed && asset.disposalDate != null
        ? (parseIsoLocalDate(asset.disposalDate) ?? previewAsOf)
        : previewAsOf;
  const depreciation = computeStraightLineDepreciation({
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    asOf,
  });
  return {
    id: asset.id,
    fiscalPeriodId: asset.fiscalPeriodId,
    name: asset.name,
    accountName: accountName ?? asset.bookAccountId,
    bookAccountId: asset.bookAccountId,
    status: asset.status,
    acquisitionDate: asset.acquisitionDate,
    acquisitionCost: asset.acquisitionCost,
    usefulLife: asset.usefulLife,
    businessRate: asset.businessRate,
    disposalDate: asset.disposalDate,
    disposalPrice: asset.disposalPrice,
    depreciationStartLabel: depreciation.periodLabel,
    remainingDepreciationLabel: depreciation.remainingLabel,
    depreciationProgress: depreciation.progress,
    currentBookValue: depreciation.currentBookValue,
  };
}
