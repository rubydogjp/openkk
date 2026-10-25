"use client";

import {
  buildFinancialStatementsDocument,
  buildGeneralLedgerDocument,
  buildJournalDocument,
  computeFsAggregate,
  withClosingVirtualEntries,
  type EntryRecord,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAssist,
  useOpenkkEntries,
  usePrintDocument,
} from "@rubydogjp/openkk-client-usecases";

export type StepDocument = {
  name: string;
  description: string;
  print: () => void;
};

export function useStepDocuments(
  fiscalPeriod: FiscalPeriod | null,
): StepDocument[] {
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const printDocument = usePrintDocument();

  const closingEntries = (period: FiscalPeriod): EntryRecord[] =>
    withClosingVirtualEntries({
      fiscalPeriodId: period.id,
      phase: period.phase,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      entries: entriesState.listFiscalPeriodEntries(period.id),
      assets: assistState.listFixedAssets(period.id),
      carryovers: assistState.listOpeningCarryovers(period.id),
    });

  const printJournal = () => {
    if (fiscalPeriod == null) return;
    printDocument(buildJournalDocument(closingEntries(fiscalPeriod)));
  };

  const printGeneralLedger = () => {
    if (fiscalPeriod == null) return;
    printDocument(
      buildGeneralLedgerDocument(
        closingEntries(fiscalPeriod),
        fiscalPeriod.opening.balanceLines,
      ),
    );
  };

  const printFinancialStatements = () => {
    if (fiscalPeriod == null) return;
    printDocument(
      buildFinancialStatementsDocument(
        computeFsAggregate({
          entries: closingEntries(fiscalPeriod),
          openingBalanceLines: fiscalPeriod.opening.balanceLines,
        }),
      ),
    );
  };

  return [
    {
      name: "仕訳帳",
      description: "日付順に並んだ, すべての取引記録",
      print: printJournal,
    },
    {
      name: "総勘定元帳",
      description: "種類ごとに並び替えて整理された記録",
      print: printGeneralLedger,
    },
    {
      name: "財務諸表",
      description: "一般に PL, BS と呼ばれる書類",
      print: printFinancialStatements,
    },
  ];
}
