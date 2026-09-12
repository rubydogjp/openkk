import type { FixedAsset } from "../assist/fixed-asset-data.js";
import {
  computePeriodDepreciation,
  computeStraightLineDepreciation,
} from "../assist/fixed-asset-depreciation.js";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover.js";
import type { BookAccountType } from "./book-account.js";
import type { EntryPreviewRow } from "./entries-types.js";
import {
  BUSINESS_RATE_TRANSFER_LOCAL_ID,
  buildBusinessRateTransferEntry,
  excludeBusinessRateTransfer,
  recordToPreviewRows,
  type EntryRecord,
} from "./entry-record.js";
import {
  parseAmount,
  parseIsoLocalDate,
} from "../shared/parse-utils.js";

const BUSINESS_RATE_TRANSFER_ROW_ID = "business-rate-transfer";

const MATERIALIZED_VIRTUAL_LOCAL_ID_PREFIX = "virtual:";

function isMaterializedVirtualEntry(entry: EntryRecord): boolean {
  return (
    entry.localId != null &&
    entry.localId.startsWith(MATERIALIZED_VIRTUAL_LOCAL_ID_PREFIX)
  );
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
    .flatMap((record) => {
      return recordToPreviewRows({
        id: record.id,
        fiscalPeriodId: record.fiscalPeriodId,
        date: record.date,
        weekday: "",
        lines: record.lines,
        description: record.description,
        businessRate: record.businessRate,
        localId: null,
      }).map((row) => ({
        ...row,
        recordId: `virtual-opening-carryover-${record.id}`,
        virtual: {
          id: `opening-carryover-${record.id}`,
          kind: "opening_carryover" as const,
          sourceId: record.id,
          label: "再振替",
          assistHref: `/assist/opening-carryover?carryover=${record.id}`,
        },
      }));
    });
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
  const { periodEndDate } = input;

  const rows: EntryPreviewRow[] = [];
  for (const asset of input.assets) {
    if (asset.fiscalPeriodId !== input.fiscalPeriodId) {
      continue;
    }

    if (asset.status === "償却中" || asset.status === "完了") {
      if (periodEndDate == null || !periodEndDate.startsWith(input.yearMonth)) {
        continue;
      }
      const asOf = parseIsoLocalDate(periodEndDate);
      if (asOf == null) continue;
      rows.push(
        ...buildDepreciationRows({
          asset,
          periodStartDate,
          asOf,
          dateText: periodEndDate,
        }),
      );
      continue;
    }

    if (asset.status === "売却済" || asset.status === "廃棄済") {
      const disposalDate = asset.disposalDate;
      if (disposalDate == null || !disposalDate.startsWith(input.yearMonth)) {
        continue;
      }
      const asOf = parseIsoLocalDate(disposalDate);
      if (asOf == null) continue;
      rows.push(
        ...buildDepreciationRows({
          asset,
          periodStartDate,
          asOf,
          dateText: disposalDate,
        }),
      );
      const bookValue = computeStraightLineDepreciation({
        acquisitionDate: asset.acquisitionDate,
        acquisitionCost: asset.acquisitionCost,
        usefulLife: asset.usefulLife,
        asOf,
      }).currentBookValue;
      if (asset.status === "売却済") {
        rows.push(...buildSaleRows({ asset, disposalDate, bookValue }));
      } else {
        rows.push(...buildRetirementRows({ asset, disposalDate, bookValue }));
      }
    }
  }
  return rows;
}

function buildDepreciationRows(input: {
  asset: FixedAsset;
  periodStartDate: Date;
  asOf: Date;
  dateText: string;
}): EntryPreviewRow[] {
  const depreciation = computePeriodDepreciation({
    acquisitionDate: input.asset.acquisitionDate,
    acquisitionCost: input.asset.acquisitionCost,
    usefulLife: input.asset.usefulLife,
    periodStartDate: input.periodStartDate,
    asOf: input.asOf,
  });
  if (depreciation <= 0) return [];
  return buildVirtualRowsFromPairs({
    recordId: `virtual-fixed-asset-${input.asset.id}`,
    date: monthDay(input.dateText),
    description: `${input.asset.name}の減価償却`,
    businessRate: input.asset.businessRate,
    virtual: fixedAssetVirtual(input.asset),
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

function buildSaleRows(input: {
  asset: FixedAsset;
  disposalDate: string;
  bookValue: number;
}): EntryPreviewRow[] {
  const disposalPrice = input.asset.disposalPrice;
  if (disposalPrice == null) {
    throw new Error(`sold fixed asset has no disposal price: ${input.asset.id}`);
  }
  const gain = Math.max(0, disposalPrice - input.bookValue);
  const loss = Math.max(0, input.bookValue - disposalPrice);
  const debits: VirtualPair[] = [];
  const credits: VirtualPair[] = [];
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
  return buildVirtualRowsFromPairs({
    recordId: `virtual-fixed-asset-sale-${input.asset.id}`,
    date: monthDay(input.disposalDate),
    description: `${input.asset.name}の売却`,
    businessRate: input.asset.businessRate,
    virtual: fixedAssetVirtual(input.asset),
    debits,
    credits,
  });
}

function buildRetirementRows(input: {
  asset: FixedAsset;
  disposalDate: string;
  bookValue: number;
}): EntryPreviewRow[] {
  if (input.bookValue <= 0) return [];
  return buildVirtualRowsFromPairs({
    recordId: `virtual-fixed-asset-retire-${input.asset.id}`,
    date: monthDay(input.disposalDate),
    description: `${input.asset.name}の除却`,
    businessRate: input.asset.businessRate,
    virtual: fixedAssetVirtual(input.asset),
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

function monthDay(isoDate: string): string {
  return `${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}`;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

type VirtualPair = {
  accountName: string;
  accountType: BookAccountType;
  bookAccountId: string | null;
  amount: number;
};

function buildVirtualRowsFromPairs(input: {
  recordId: string;
  date: string;
  description: string;
  businessRate: number;
  virtual: EntryPreviewRow["virtual"];
  debits: VirtualPair[];
  credits: VirtualPair[];
}): EntryPreviewRow[] {
  const rowCount = Math.max(input.debits.length, input.credits.length);
  if (rowCount === 0) return [];
  return Array.from({ length: rowCount }, (_, index): EntryPreviewRow => {
    const debit = input.debits[index] ?? null;
    const credit = input.credits[index] ?? null;
    return {
      recordId: input.recordId,
      lineIndex: index,
      lineCount: rowCount,
      isFirstOfRecord: index === 0,
      date: input.date,
      weekday: "",
      debit: debit?.accountName ?? "",
      debitType: debit?.accountType ?? "asset",
      debitAmount: debit == null ? "" : formatAmount(debit.amount),
      debitBookAccountId: debit?.bookAccountId,
      credit: credit?.accountName ?? "",
      creditType: credit?.accountType ?? "asset",
      creditAmount: credit == null ? "" : formatAmount(credit.amount),
      creditBookAccountId: credit?.bookAccountId,
      description: input.description,
      partner: "",
      businessRate: input.businessRate,
      taxCategory: "対象外",
      businessCategory: "",
      virtual: input.virtual,
      debitPartnerName: null,
      debitTaxCategoryId: null,
      debitBusinessCategoryId: null,
      creditPartnerName: null,
      creditTaxCategoryId: null,
      creditBusinessCategoryId: null,
    };
  });
}

export function buildClosingVirtualEntries(input: {
  fiscalPeriodId: string;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAsset[];
  carryovers: OpeningCarryoverRecord[];
}): EntryRecord[] {
  const carryoverEntries = input.carryovers.flatMap((record) =>
    materializeVirtualEntryRows({
      fiscalPeriodId: input.fiscalPeriodId,
      yearMonth: record.date.slice(0, 7),
      rows: buildVirtualOpeningCarryoverRows({
        fiscalPeriodId: input.fiscalPeriodId,
        records: [record],
        yearMonth: record.date.slice(0, 7),
      }),
    }),
  );

  const fixedAssetMonths = new Set<string>();
  if (input.periodEndDate != null && input.periodEndDate.length >= 7) {
    fixedAssetMonths.add(input.periodEndDate.slice(0, 7));
  }
  for (const asset of input.assets) {
    if (asset.disposalDate != null && asset.disposalDate.length >= 7) {
      fixedAssetMonths.add(asset.disposalDate.slice(0, 7));
    }
  }
  const fixedAssetEntries = [...fixedAssetMonths].flatMap((yearMonth) =>
    materializeVirtualEntryRows({
      fiscalPeriodId: input.fiscalPeriodId,
      yearMonth,
      rows: buildVirtualFixedAssetRows({
        fiscalPeriodId: input.fiscalPeriodId,
        assets: input.assets,
        periodStartDate: input.periodStartDate,
        periodEndDate: input.periodEndDate,
        yearMonth,
      }),
    }),
  );

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

export function withClosingVirtualEntries(input: {
  fiscalPeriodId: string;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAsset[];
  carryovers: OpeningCarryoverRecord[];
}): EntryRecord[] {
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
  input: Parameters<typeof withClosingVirtualEntries>[0],
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

export function materializeVirtualEntryRows(input: {
  fiscalPeriodId: string;
  yearMonth: string;
  rows: EntryPreviewRow[];
}): EntryRecord[] {
  const grouped = new Map<string, EntryPreviewRow[]>();
  for (const row of input.rows) {
    if (row.virtual == null) continue;
    const current = grouped.get(row.recordId) ?? [];
    current.push(row);
    grouped.set(row.recordId, current);
  }

  return Array.from(grouped.entries()).map(([recordId, rows]): EntryRecord => {
    const sorted = [...rows].sort(
      (left, right) => left.lineIndex - right.lineIndex,
    );
    const first = sorted[0]!;
    const lines = sorted.flatMap((row) => {
      const out: EntryRecord["lines"] = [];
      if (row.debit.trim() !== "" && parseAmount(row.debitAmount) > 0) {
        out.push({
          side: "debit",
          accountName: row.debit,
          accountType: row.debitType,
          amount: row.debitAmount,
          bookAccountId: row.debitBookAccountId,
          partnerName: row.debitPartnerName ?? first.partner,
          taxCategoryId: row.debitTaxCategoryId,
          businessCategoryId: row.debitBusinessCategoryId,
          id: null,
          taxCategoryName: first.taxCategory,
          businessCategoryName: first.businessCategory,
        });
      }
      if (row.credit.trim() !== "" && parseAmount(row.creditAmount) > 0) {
        out.push({
          side: "credit",
          accountName: row.credit,
          accountType: row.creditType,
          amount: row.creditAmount,
          bookAccountId: row.creditBookAccountId,
          partnerName: row.creditPartnerName ?? first.partner,
          taxCategoryId: row.creditTaxCategoryId,
          businessCategoryId: row.creditBusinessCategoryId,
          id: null,
          taxCategoryName: first.taxCategory,
          businessCategoryName: first.businessCategory,
        });
      }
      return out;
    });
    const date = `${input.yearMonth}-${first.date.slice(3, 5)}`;
    return {
      id: `materialized-${recordId}`,
      fiscalPeriodId: input.fiscalPeriodId,
      date,
      weekday: "",
      lines,
      description: first.description,
      businessRate: first.businessRate,
      localId: `virtual:${recordId}`,
    };
  });
}
