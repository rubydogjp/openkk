import type { FixedAssetPreviewItem } from "../assist/fixed-asset-data";
import {
  computePeriodDepreciation,
  computeStraightLineDepreciation,
} from "../assist/fixed-asset-depreciation";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover";
import type { EntryAccountVisualType, EntryPreviewRow } from "./entries-types";
import {
  BUSINESS_RATE_TRANSFER_LOCAL_ID,
  buildBusinessRateTransferEntry,
  recordToPreviewRows,
  type EntryRecord,
} from "./entry-record";
import { parseAmount, parseIsoLocalDate } from "../shared/parse-utils";

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
    .map((record) => ({
      recordId: `virtual-opening-carryover-${record.id}`,
      lineIndex: 0,
      lineCount: 1,
      isFirstOfRecord: true,
      date: `${record.date.slice(5, 7)}/${record.date.slice(8, 10)}`,
      weekday: "",
      debit: record.debit,
      debitType: record.debitType,
      debitAmount: record.debitAmount,
      credit: record.credit,
      creditType: record.creditType,
      creditAmount: record.creditAmount,
      description: record.description,
      partner: record.partner,
      businessRate: record.businessRate,
      taxCategory: record.taxCategory,
      businessCategory: record.businessCategory,
      virtual: {
        id: `opening-carryover-${record.id}`,
        kind: "opening_carryover",
        sourceId: record.id,
        label: "再振替",
        assistHref: `/assist/opening-carryover?carryover=${record.id}`,
      },
    }));
}

type FixedAssetTruth = {
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
};

/**
 * 償却計算に必要な「真実」の値をプレビュー項目から取り出す。取得価額は
 * `acquisitionCost`（無ければ表示用 `purchase` 文字列）から復元する。
 * 必須値が欠ける／不正な資産は減価償却の対象外（null）とする。
 */
function fixedAssetTruth(asset: FixedAssetPreviewItem): FixedAssetTruth | null {
  const { acquisitionDate, usefulLife } = asset;
  if (acquisitionDate == null || usefulLife == null) return null;
  if (parseIsoLocalDate(acquisitionDate) == null) return null;
  const acquisitionCost = asset.acquisitionCost ?? parseAmount(asset.purchase);
  if (!Number.isFinite(acquisitionCost) || acquisitionCost <= 0) return null;
  return { acquisitionDate, acquisitionCost, usefulLife };
}

function fixedAssetVirtual(asset: FixedAssetPreviewItem) {
  return {
    id: `fixed-asset-${asset.id}`,
    kind: "fixed_asset" as const,
    sourceId: asset.id,
    label: "固定資産",
    assistHref: `/assist/fixed-assets?asset=${asset.id}`,
  };
}

function businessRateLabel(asset: FixedAssetPreviewItem): string {
  return asset.businessRate == null
    ? ""
    : String(Math.round(asset.businessRate * 100));
}

/**
 * 固定資産から当期のバーチャル仕訳行を生成する。
 *
 * - 償却中: 期末月に当期償却費（期首〜期末の月割）を計上。
 * - 売却済: 処分月に「期首〜処分日の当期償却費」＋売却仕訳（処分日簿価で資産を除く）。
 * - 廃棄済: 処分月に「期首〜処分日の当期償却費」＋固定資産除却損で簿価を除却。
 * - 完了(償却済): 備忘価額のみのため仕訳なし。
 *
 * 減価償却費・除却損は全額ベースで計上し、家事按分は businessRate として持たせる。
 * 個人負担分（事業主貸）への振替は集計層（fs-data / summary）で行う。
 */
export function buildVirtualFixedAssetRows(input: {
  fiscalPeriodId: string;
  assets: FixedAssetPreviewItem[];
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
    if (
      asset.fiscalPeriodId != null &&
      asset.fiscalPeriodId !== input.fiscalPeriodId
    ) {
      continue;
    }
    const truth = fixedAssetTruth(asset);
    if (truth == null) continue;

    if (asset.status === "償却中") {
      if (periodEndDate == null || !periodEndDate.startsWith(input.yearMonth)) {
        continue;
      }
      const asOf = parseIsoLocalDate(periodEndDate);
      if (asOf == null) continue;
      rows.push(
        ...buildDepreciationRows({
          asset,
          truth,
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
      // (1) 期首〜処分日の当期償却費を先に計上し、簿価を処分日時点まで落とす。
      rows.push(
        ...buildDepreciationRows({
          asset,
          truth,
          periodStartDate,
          asOf,
          dateText: disposalDate,
        }),
      );
      // (2) 処分日時点の簿価で資産を売却 / 除却する。
      const bookValue = computeStraightLineDepreciation({
        ...truth,
        asOf,
      }).currentBookValue;
      if (asset.status === "売却済") {
        rows.push(...buildSaleRows({ asset, disposalDate, bookValue }));
      } else {
        rows.push(...buildRetirementRows({ asset, disposalDate, bookValue }));
      }
    }
    // "完了"(retired) は備忘価額のみで仕訳不要。
  }
  return rows;
}

function buildDepreciationRows(input: {
  asset: FixedAssetPreviewItem;
  truth: FixedAssetTruth;
  periodStartDate: Date;
  asOf: Date;
  dateText: string;
}): EntryPreviewRow[] {
  const depreciation = computePeriodDepreciation({
    ...input.truth,
    periodStartDate: input.periodStartDate,
    asOf: input.asOf,
  });
  if (depreciation <= 0) return [];
  return buildVirtualRowsFromPairs({
    recordId: `virtual-fixed-asset-${input.asset.id}`,
    date: monthDay(input.dateText),
    description: `${input.asset.name}の減価償却`,
    businessRate: businessRateLabel(input.asset),
    virtual: fixedAssetVirtual(input.asset),
    debits: [
      {
        accountName: "減価償却費",
        accountType: "expense",
        amount: depreciation,
      },
    ],
    credits: [
      {
        accountName: input.asset.account,
        accountType: "asset",
        amount: depreciation,
      },
    ],
  });
}

function buildSaleRows(input: {
  asset: FixedAssetPreviewItem;
  disposalDate: string;
  bookValue: number;
}): EntryPreviewRow[] {
  const disposalPrice = parseAmount(input.asset.disposalPrice ?? "0");
  const gain = Math.max(0, disposalPrice - input.bookValue);
  const loss = Math.max(0, input.bookValue - disposalPrice);
  const debits: VirtualPair[] = [];
  const credits: VirtualPair[] = [];
  if (disposalPrice > 0) {
    debits.push({
      accountName: "普通預金",
      accountType: "asset",
      amount: disposalPrice,
    });
  }
  if (loss > 0) {
    debits.push({
      accountName: "固定資産売却損",
      accountType: "expense",
      amount: loss,
    });
  }
  if (input.bookValue > 0) {
    credits.push({
      accountName: input.asset.account,
      accountType: "asset",
      amount: input.bookValue,
    });
  }
  if (gain > 0) {
    credits.push({
      accountName: "固定資産売却益",
      accountType: "revenue",
      amount: gain,
    });
  }
  return buildVirtualRowsFromPairs({
    recordId: `virtual-fixed-asset-sale-${input.asset.id}`,
    date: monthDay(input.disposalDate),
    description: `${input.asset.name}の売却`,
    businessRate: businessRateLabel(input.asset),
    virtual: fixedAssetVirtual(input.asset),
    debits,
    credits,
  });
}

function buildRetirementRows(input: {
  asset: FixedAssetPreviewItem;
  disposalDate: string;
  bookValue: number;
}): EntryPreviewRow[] {
  // 簿価が残っている場合のみ、残存簿価を固定資産除却損として計上する。
  if (input.bookValue <= 0) return [];
  return buildVirtualRowsFromPairs({
    recordId: `virtual-fixed-asset-retire-${input.asset.id}`,
    date: monthDay(input.disposalDate),
    description: `${input.asset.name}の除却`,
    businessRate: businessRateLabel(input.asset),
    virtual: fixedAssetVirtual(input.asset),
    debits: [
      {
        accountName: "固定資産除却損",
        accountType: "expense",
        amount: input.bookValue,
      },
    ],
    credits: [
      {
        accountName: input.asset.account,
        accountType: "asset",
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
  accountType: EntryAccountVisualType;
  amount: number;
};

function buildVirtualRowsFromPairs(input: {
  recordId: string;
  date: string;
  description: string;
  businessRate: string;
  virtual: EntryPreviewRow["virtual"];
  debits: VirtualPair[];
  credits: VirtualPair[];
}): EntryPreviewRow[] {
  const rowCount = Math.max(input.debits.length, input.credits.length);
  if (rowCount === 0) return [];
  return Array.from({ length: rowCount }, (_, index) => {
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
      credit: credit?.accountName ?? "",
      creditType: credit?.accountType ?? "asset",
      creditAmount: credit == null ? "" : formatAmount(credit.amount),
      description: input.description,
      partner: "",
      businessRate: input.businessRate,
      taxCategory: "対象外",
      businessCategory: "",
      virtual: input.virtual,
    };
  });
}

export function buildClosingVirtualEntries(input: {
  fiscalPeriodId: string;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAssetPreviewItem[];
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
  assets: FixedAssetPreviewItem[];
  carryovers: OpeningCarryoverRecord[];
}): EntryRecord[] {
  const materializedLocalIds = new Set(
    input.entries
      .map((entry) => entry.localId)
      .filter(
        (localId): localId is string => localId != null && localId !== "",
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

export function buildVirtualBusinessRateTransferRows(input: {
  fiscalPeriodId: string;
  periodStartDate: string | null;
  periodEndDate: string | null;
  entries: EntryRecord[];
  assets: FixedAssetPreviewItem[];
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
  return recordToPreviewRows(transfer).map((row) => ({
    ...row,
    recordId: BUSINESS_RATE_TRANSFER_ROW_ID,
    virtual: {
      id: BUSINESS_RATE_TRANSFER_ROW_ID,
      kind: "business_rate_transfer",
      sourceId: transfer.id,
      label: "家事按分",
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
    if (row.virtual == null || row.recordId == null) continue;
    const current = grouped.get(row.recordId) ?? [];
    current.push(row);
    grouped.set(row.recordId, current);
  }

  return Array.from(grouped.entries()).map(([recordId, rows]) => {
    const sorted = [...rows].sort(
      (left, right) => (left.lineIndex ?? 0) - (right.lineIndex ?? 0),
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
        });
      }
      if (row.credit.trim() !== "" && parseAmount(row.creditAmount) > 0) {
        out.push({
          side: "credit",
          accountName: row.credit,
          accountType: row.creditType,
          amount: row.creditAmount,
        });
      }
      return out;
    });
    const debitLine = lines.find((line) => line.side === "debit") ?? null;
    const creditLine = lines.find((line) => line.side === "credit") ?? null;
    const date = `${input.yearMonth}-${first.date.slice(3, 5)}`;
    return {
      id: `materialized-${recordId}`,
      fiscalPeriodId: input.fiscalPeriodId,
      date,
      weekday: "",
      lines,
      debit: debitLine?.accountName ?? "",
      debitType: debitLine?.accountType ?? "asset",
      debitAmount: debitLine?.amount ?? "",
      credit: creditLine?.accountName ?? "",
      creditType: creditLine?.accountType ?? "asset",
      creditAmount: creditLine?.amount ?? "",
      description: first.description,
      partner: first.partner,
      businessRate: first.businessRate,
      taxCategory: first.taxCategory,
      businessCategory: first.businessCategory,
      localId: `virtual:${recordId}`,
    };
  });
}
