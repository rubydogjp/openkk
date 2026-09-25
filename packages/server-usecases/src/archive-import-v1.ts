import { requireObject } from "@rubydogjp/openkk-server-domain";
import type { FiscalPeriodArchiveContent } from "./archive-import.js";

const TAX_CATEGORY_IDS: Readonly<Record<string, string>> = {
  "課税 10%": "tax_10",
  "軽減税率 8%": "tax_8",
  免税: "tax_exempt",
  非課税: "tax_non_taxable",
  対象外: "tax_out_of_scope",
};

const BUSINESS_CATEGORY_IDS: Readonly<Record<string, string>> = {
  "第1種（卸売業）": "biz_1",
  "第2種（小売業等）": "biz_2",
  "第3種（製造業等）": "biz_3",
  "第4種（その他）": "biz_4",
  "第5種（サービス業等）": "biz_5",
  "第6種（不動産業）": "biz_6",
  対象外: "biz_none",
};

export function migrateFiscalPeriodArchiveV1(
  content: FiscalPeriodArchiveContent,
): FiscalPeriodArchiveContent {
  return {
    fiscalPeriod: {
      ...content.fiscalPeriod,
      phase: migratePhase(content.fiscalPeriod),
      opening: migrateOpening(content.fiscalPeriod.opening),
    },
    entries: content.entries.map((value) => {
      const entry = requireObject(value, "archive entry");
      return {
        ...entry,
        localId:
          typeof entry.localId === "string" && entry.localId.trim() === ""
            ? null
            : entry.localId,
        lines: mapArray(entry.lines, migrateLine),
      };
    }),
    fixedAssets: content.fixedAssets.map((value) => {
      const asset = requireObject(value, "archive fixedAsset");
      return {
        ...asset,
        disposalDate:
          asset.status === "sold" || asset.status === "disposed"
            ? asset.disposalDate
            : null,
        disposalPrice: asset.status === "sold" ? asset.disposalPrice : null,
      };
    }),
    closings: content.closings,
  };
}

function migratePhase(fiscalPeriod: Record<string, unknown>): unknown {
  return fiscalPeriod.phase === "pre_opening" &&
    fiscalPeriod.settingsCompleted === true
    ? "journalizing"
    : fiscalPeriod.phase;
}

function migrateOpening(value: unknown): Record<string, unknown> {
  if (value == null) return { balanceLines: [], journals: [] };
  const opening = requireObject(value, "archive opening");
  return {
    balanceLines: opening.openingBalanceLines ?? [],
    journals: mapArray(opening.openingJournals ?? [], (value) => {
      const journal = requireObject(value, "archive openingJournal");
      return { ...journal, lines: mapArray(journal.lines, migrateLine) };
    }),
  };
}

function migrateLine(value: unknown): unknown {
  const line = requireObject(value, "archive line");
  return {
    ...line,
    taxCategoryId: categoryId(line.taxCategoryId, TAX_CATEGORY_IDS),
    businessCategoryId: categoryId(
      line.businessCategoryId,
      BUSINESS_CATEGORY_IDS,
    ),
  };
}

function categoryId(
  value: unknown,
  idsByName: Readonly<Record<string, string>>,
): unknown {
  return typeof value === "string" && Object.hasOwn(idsByName, value)
    ? idsByName[value]
    : value;
}

function mapArray(value: unknown, map: (item: unknown) => unknown): unknown {
  return Array.isArray(value) ? value.map(map) : value;
}
