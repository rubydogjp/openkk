import type { FixedAsset } from "../assist/fixed-asset-data.js";
import type { OpeningCarryoverRecord } from "../assist/opening-carryover.js";
import type { EntryRecord } from "../entries/entry-record.js";
import {
  buildClosingVirtualEntries,
  isMaterializedVirtualEntry,
  withClosingVirtualEntries,
} from "../entries/virtual-entries.js";
import type { FiscalPeriodPhase } from "../shared/models.js";
import { buildFinancialStatementsDocument } from "./financial-statements-print.js";
import { computeFsAggregate } from "./fs-data.js";
import { buildGeneralLedgerDocument } from "./general-ledger-print.js";
import { buildJournalDocument } from "./journal-print.js";
import { buildPrintHeading } from "./print-heading.js";

export const FISCAL_PERIOD_REPORT_KINDS = [
  "journal",
  "generalLedger",
  "financialStatements",
] as const;

export type FiscalPeriodReportKind =
  (typeof FISCAL_PERIOD_REPORT_KINDS)[number];

export const FISCAL_PERIOD_REPORT_LABELS: Record<
  FiscalPeriodReportKind,
  { name: string; description: string }
> = {
  journal: {
    name: "仕訳帳",
    description: "日付順に並んだ、すべての取引記録",
  },
  generalLedger: {
    name: "総勘定元帳",
    description: "種類ごとに並び替えて整理された記録",
  },
  financialStatements: {
    name: "財務諸表",
    description: "一般に P/L・B/S と呼ばれる書類",
  },
};

export type FiscalPeriodReportInput = {
  fiscalPeriod: {
    id: string;
    name: string;
    phase: FiscalPeriodPhase;
    startDate: string;
    endDate: string;
    opening: {
      balanceLines: Array<{ id: string; accountId: string; amount: number }>;
    };
  };
  entries: EntryRecord[];
  assets: FixedAsset[];
  carryovers: OpeningCarryoverRecord[];
};

export function isProvisionalReport(phase: FiscalPeriodPhase): boolean {
  return phase !== "post_closing";
}

export function buildFiscalPeriodReport(
  kind: FiscalPeriodReportKind,
  input: FiscalPeriodReportInput,
  preparedOn: Date,
): string {
  const { fiscalPeriod } = input;
  const heading = buildPrintHeading({
    fiscalPeriodName: fiscalPeriod.name,
    startDate: fiscalPeriod.startDate,
    endDate: fiscalPeriod.endDate,
    preparedOn,
    provisional: isProvisionalReport(fiscalPeriod.phase),
  });
  const entries = withClosingVirtualEntries({
    fiscalPeriodId: fiscalPeriod.id,
    phase: fiscalPeriod.phase,
    periodStartDate: fiscalPeriod.startDate,
    periodEndDate: fiscalPeriod.endDate,
    entries: input.entries,
    assets: input.assets,
    carryovers: input.carryovers,
  });
  const openingBalanceLines = fiscalPeriod.opening.balanceLines;
  switch (kind) {
    case "journal":
      return buildJournalDocument(entries, heading);
    case "generalLedger":
      return buildGeneralLedgerDocument(entries, openingBalanceLines, heading);
    case "financialStatements":
      return buildFinancialStatementsDocument(
        computeFsAggregate({ entries, openingBalanceLines }),
        heading,
      );
  }
}

export function buildFinalClosingEntries(
  input: FiscalPeriodReportInput,
): EntryRecord[] {
  return buildClosingVirtualEntries({
    fiscalPeriodId: input.fiscalPeriod.id,
    periodStartDate: input.fiscalPeriod.startDate,
    periodEndDate: input.fiscalPeriod.endDate,
    entries: input.entries.filter(
      (entry) => !isMaterializedVirtualEntry(entry),
    ),
    assets: input.assets,
    carryovers: input.carryovers,
  });
}
