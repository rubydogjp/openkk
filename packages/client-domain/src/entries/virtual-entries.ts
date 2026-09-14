import type { FixedAsset } from "../assist/fixed-asset-data.js";
import {
  computePeriodDepreciation,
  computeStraightLineDepreciation,
} from "../assist/fixed-asset-depreciation.js";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover.js";
import type { FiscalPeriodPhase } from "../shared/models.js";
import type { BookAccountType } from "./book-account.js";
import type { EntryPreviewRow } from "./entries-types.js";
import {
  BUSINESS_RATE_TRANSFER_LOCAL_ID,
  buildBusinessRateTransferEntry,
  excludeBusinessRateTransfer,
  recordToPreviewRows,
  type EntryRecord,
} from "./entry-record.js";
import { parseIsoLocalDate } from "../shared/parse-utils.js";

const BUSINESS_RATE_TRANSFER_ROW_ID = "business-rate-transfer";

const MATERIALIZED_VIRTUAL_LOCAL_ID_PREFIX = "virtual:";

function isMaterializedVirtualEntry(entry: EntryRecord): boolean {
  return (
    entry.localId != null &&
    entry.localId.startsWith(MATERIALIZED_VIRTUAL_LOCAL_ID_PREFIX)
  );
}

export function buildVirtualOpeningCarryoverEntries(input: {
  fiscalPeriodId: string;
  records: OpeningCarryoverRecord[];
}): EntryRecord[] {
  return input.records
    .filter((record) => record.fiscalPeriodId === input.fiscalPeriodId)
    .map(openingCarryoverEntry);
}

function openingCarryoverEntry(record: OpeningCarryoverRecord): EntryRecord {
  const id = `virtual-opening-carryover-${record.id}`;
  return {
    id,
    fiscalPeriodId: record.fiscalPeriodId,
    date: record.date,
    weekday: "",
    lines: record.lines.map((line) => ({ ...line, id: null })),
    description: record.description,
    businessRate: record.businessRate,
    localId: `virtual:${id}`,
  };
}

export function buildVirtualOpeningCarryoverRows(input: {
  fiscalPeriodId: string;
  records: OpeningCarryoverRecord[];
  yearMonth: string;
}): EntryPreviewRow[] {
  return input.records
    .filter(
      (record) =>
        record.fiscalPeriodId === input.fiscalPeriodId &&
        record.date.startsWith(input.yearMonth),
    )
    .flatMap((record) =>
      recordToPreviewRows(openingCarryoverEntry(record)).map((row) => ({
        ...row,
        virtual: {
          id: `opening-carryover-${record.id}`,
          kind: "opening_carryover" as const,
          sourceId: record.id,
          label: "再振替",
          assistHref: `/assist/opening-carryover?carryover=${record.id}`,
        },
      })),
    );
}

function fixedAssetVirtual(asset: FixedAsset) {
  return {
    id: `fixed-asset-${asset.id}`,
    kind: "fixed_asset" as const,
    sourceId: asset.id,
    label: "固定資産",
    assistHref: `/assist/fixed-assets?asset=${asset.id}`,
  };
}

export function buildVirtualFixedAssetEntries(input: {
  fiscalPeriodId: string;
  assets: FixedAsset[];
  periodStartDate: string | null;
  periodEndDate: string | null;
}): EntryRecord[] {
  const periodStartDate =
    input.periodStartDate == null
      ? null
      : parseIsoLocalDate(input.periodStartDate);
  if (periodStartDate == null) return [];
  return input.assets
    .filter((asset) => asset.fiscalPeriodId === input.fiscalPeriodId)
    .flatMap((asset) =>
      fixedAssetEntries(asset, periodStartDate, input.periodEndDate),
    );
}

export function buildVirtualFixedAssetRows(input: {
  fiscalPeriodId: string;
  assets: FixedAsset[];
  periodStartDate: string | null;
  periodEndDate: string | null;
  yearMonth: string;
}): EntryPreviewRow[] {
  const periodStartDate =
    input.periodStartDate == null
      ? null
      : parseIsoLocalDate(input.periodStartDate);
  if (periodStartDate == null) return [];
  return input.assets
    .filter((asset) => asset.fiscalPeriodId === input.fiscalPeriodId)
    .flatMap((asset) =>
      fixedAssetEntries(asset, periodStartDate, input.periodEndDate)
        .filter((entry) => entry.date.startsWith(input.yearMonth))
        .flatMap((entry) =>
          recordToPreviewRows(entry).map((row) => ({
            ...row,
            virtual: fixedAssetVirtual(asset),
          })),
        ),
    );
}

function fixedAssetEntries(
  asset: FixedAsset,
  periodStartDate: Date,
  periodEndDate: string | null,
): EntryRecord[] {
  const dateText =
    asset.status === "償却中" || asset.status === "完了"
      ? periodEndDate
      : asset.disposalDate;
  if (dateText == null) return [];
  const asOf = parseIsoLocalDate(dateText);
  if (asOf == null) return [];
  const entries = buildDepreciationEntries({
    asset,
    periodStartDate,
    asOf,
    dateText,
  });
  if (asset.status === "売却済" || asset.status === "廃棄済") {
    const bookValue = computeStraightLineDepreciation({
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      usefulLife: asset.usefulLife,
      asOf,
    }).currentBookValue;
    entries.push(
      ...(asset.status === "売却済"
        ? buildSaleEntries({ asset, disposalDate: dateText, bookValue })
        : buildRetirementEntries({ asset, disposalDate: dateText, bookValue })),
    );
  }
  return entries;
}

function buildDepreciationEntries(input: {
  asset: FixedAsset;
  periodStartDate: Date;
  asOf: Date;
  dateText: string;
}): EntryRecord[] {
  const depreciation = computePeriodDepreciation({
    acquisitionDate: input.asset.acquisitionDate,
    acquisitionCost: input.asset.acquisitionCost,
    usefulLife: input.asset.usefulLife,
    periodStartDate: input.periodStartDate,
    asOf: input.asOf,
  });
  if (depreciation <= 0) return [];
  return buildFixedAssetEntriesFromLines({
    recordId: `virtual-fixed-asset-${input.asset.id}`,
    date: input.dateText,
    description: `${input.asset.name}の減価償却`,
    businessRate: input.asset.businessRate,
    fiscalPeriodId: input.asset.fiscalPeriodId,
    debits: [
      {
        accountName: "減価償却費",
        accountType: "expense",
        bookAccountId: "acct_depreciation",
        amount: depreciation,
      },
    ],
    credits: [
      {
        accountName: input.asset.accountName,
        accountType: "asset",
        bookAccountId: input.asset.bookAccountId,
        amount: depreciation,
      },
    ],
  });
}

function buildSaleEntries(input: {
  asset: FixedAsset;
  disposalDate: string;
  bookValue: number;
}): EntryRecord[] {
  const disposalPrice = input.asset.disposalPrice;
  if (disposalPrice == null) {
    throw new Error(`sold fixed asset has no disposal price: ${input.asset.id}`);
  }
  const gain = Math.max(0, disposalPrice - input.bookValue);
  const loss = Math.max(0, input.bookValue - disposalPrice);
  const debits: FixedAssetEntryLineInput[] = [];
  const credits: FixedAssetEntryLineInput[] = [];
  if (disposalPrice > 0) {
    debits.push({
      accountName: "普通預金",
      accountType: "asset",
      bookAccountId: "acct_bank",
      amount: disposalPrice,
    });
  }
  if (loss > 0) {
    debits.push({
      accountName: "固定資産売却損",
      accountType: "expense",
      bookAccountId: "acct_expense_固定資産売却損",
      amount: loss,
    });
  }
  if (input.bookValue > 0) {
    credits.push({
      accountName: input.asset.accountName,
      accountType: "asset",
      bookAccountId: input.asset.bookAccountId,
      amount: input.bookValue,
    });
  }
  if (gain > 0) {
    credits.push({
      accountName: "固定資産売却益",
      accountType: "revenue",
      bookAccountId: "acct_revenue_固定資産売却益",
      amount: gain,
    });
  }
  return buildFixedAssetEntriesFromLines({
    recordId: `virtual-fixed-asset-sale-${input.asset.id}`,
    date: input.disposalDate,
    description: `${input.asset.name}の売却`,
    businessRate: input.asset.businessRate,
    fiscalPeriodId: input.asset.fiscalPeriodId,
    debits,
    credits,
  });
}

function buildRetirementEntries(input: {
  asset: FixedAsset;
  disposalDate: string;
  bookValue: number;
}): EntryRecord[] {
  if (input.bookValue <= 0) return [];
  return buildFixedAssetEntriesFromLines({
    recordId: `virtual-fixed-asset-retire-${input.asset.id}`,
    date: input.disposalDate,
    description: `${input.asset.name}の除却`,
    businessRate: input.asset.businessRate,
    fiscalPeriodId: input.asset.fiscalPeriodId,
    debits: [
      {
        accountName: "固定資産除却損",
        accountType: "expense",
        bookAccountId: "acct_expense_固定資産除却損",
        amount: input.bookValue,
      },
    ],
    credits: [
      {
        accountName: input.asset.accountName,
        accountType: "asset",
        bookAccountId: input.asset.bookAccountId,
        amount: input.bookValue,
      },
    ],
  });
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

type FixedAssetEntryLineInput = {
  accountName: string;
  accountType: BookAccountType;
  bookAccountId: string;
  amount: number;
};

function buildFixedAssetEntriesFromLines(input: {
  recordId: string;
  fiscalPeriodId: string;
  date: string;
  description: string;
  businessRate: number;
  debits: FixedAssetEntryLineInput[];
  credits: FixedAssetEntryLineInput[];
}): EntryRecord[] {
  if (input.debits.length === 0 && input.credits.length === 0) return [];
  return [
    {
      id: input.recordId,
      fiscalPeriodId: input.fiscalPeriodId,
      date: input.date,
      weekday: "",
      description: input.description,
      businessRate: input.businessRate,
      localId: `virtual:${input.recordId}`,
      lines: [
        ...input.debits.map((line) => ({ ...line, side: "debit" as const })),
        ...input.credits.map((line) => ({ ...line, side: "credit" as const })),
      ].map((line) => ({
        ...line,
        amount: formatAmount(line.amount),
        id: null,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        taxCategoryName: "対象外",
        businessCategoryId: "biz_none",
        businessCategoryName: "対象外",
      })),
    },
  ];
}

export function buildClosingVirtualEntries(input: {
  fiscalPeriodId: string;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAsset[];
  carryovers: OpeningCarryoverRecord[];
}): EntryRecord[] {
  const carryoverEntries = buildVirtualOpeningCarryoverEntries({
    fiscalPeriodId: input.fiscalPeriodId,
    records: input.carryovers,
  });
  const fixedAssetEntries = buildVirtualFixedAssetEntries({
    fiscalPeriodId: input.fiscalPeriodId,
    assets: input.assets,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
  });

  const assistEntries = [...carryoverEntries, ...fixedAssetEntries];

  const transfer =
    input.periodEndDate == null
      ? null
      : buildBusinessRateTransferEntry({
          fiscalPeriodId: input.fiscalPeriodId,
          entries: [...input.entries, ...assistEntries],
          date: input.periodEndDate,
        });

  return transfer == null ? assistEntries : [...assistEntries, transfer];
}

export type FiscalPeriodEntriesInput = {
  fiscalPeriodId: string;
  phase: FiscalPeriodPhase;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAsset[];
  carryovers: OpeningCarryoverRecord[];
};

export function withClosingVirtualEntries(
  input: FiscalPeriodEntriesInput,
): EntryRecord[] {
  if (input.phase === "post_closing") return input.entries;
  const materializedLocalIds = new Set(
    input.entries
      .map((entry) => entry.localId)
      .filter(
        (localId): localId is string => localId != null,
      ),
  );
  const realEntries = input.entries.filter(
    (entry) => !isMaterializedVirtualEntry(entry),
  );
  const virtualEntries = buildClosingVirtualEntries({
    fiscalPeriodId: input.fiscalPeriodId,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    entries: realEntries,
    assets: input.assets,
    carryovers: input.carryovers,
  }).filter(
    (entry) =>
      entry.localId == null || !materializedLocalIds.has(entry.localId),
  );
  return [...input.entries, ...virtualEntries];
}

export function buildAnalyticsEntries(
  input: FiscalPeriodEntriesInput,
): EntryRecord[] {
  return excludeBusinessRateTransfer(withClosingVirtualEntries(input));
}

export function buildVirtualBusinessRateTransferRows(input: {
  fiscalPeriodId: string;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAsset[];
  carryovers: OpeningCarryoverRecord[];
  yearMonth: string;
}): EntryPreviewRow[] {
  const transfer = buildClosingVirtualEntries({
    fiscalPeriodId: input.fiscalPeriodId,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    entries: input.entries,
    assets: input.assets,
    carryovers: input.carryovers,
  }).find((entry) => entry.localId === BUSINESS_RATE_TRANSFER_LOCAL_ID);
  if (transfer == null || !transfer.date.startsWith(input.yearMonth)) return [];
  return recordToPreviewRows(transfer).map((row): EntryPreviewRow => ({
    ...row,
    recordId: BUSINESS_RATE_TRANSFER_ROW_ID,
    virtual: {
      id: BUSINESS_RATE_TRANSFER_ROW_ID,
      kind: "business_rate_transfer",
      sourceId: transfer.id,
      label: "家事按分",
      assistHref: null,
    },
  }));
}
