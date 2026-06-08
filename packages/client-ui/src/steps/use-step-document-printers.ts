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

export function useStepDocumentPrinters(
  fiscalPeriod: FiscalPeriod | undefined,
) {
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const printDocument = usePrintDocument();

  const closingEntries = (period: FiscalPeriod): EntryRecord[] =>
    withClosingVirtualEntries({
      fiscalPeriodId: period.id,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      entries: entriesState.listFiscalPeriodEntries(period.id),
      assets: assistState.listFixedAssets(),
      carryovers: assistState.listOpeningCarryovers(period.id),
    });

  const printJournal = () => {
    if (fiscalPeriod == null) return;
    printDocument(
      buildJournalDocument(fiscalPeriod.name, closingEntries(fiscalPeriod)),
    );
  };

  const printGeneralLedger = () => {
    if (fiscalPeriod == null) return;
    const openingBalanceLines = fiscalPeriod.opening?.openingBalanceLines ?? [];
    printDocument(
      buildGeneralLedgerDocument(
        fiscalPeriod.name,
        closingEntries(fiscalPeriod),
        openingBalanceLines,
      ),
    );
  };

  const printFinancialStatements = () => {
    if (fiscalPeriod == null) return;
    const openingBalanceLines = fiscalPeriod.opening?.openingBalanceLines ?? [];
    const { amounts, bsRows, expenseWriteIns } = computeFsAggregate({
      entries: closingEntries(fiscalPeriod),
      openingBalanceLines,
    });
    printDocument(
      buildFinancialStatementsDocument({
        fpName: fiscalPeriod.name,
        amounts,
        bsRows,
        expenseWriteIns,
      }),
    );
  };

  return { printJournal, printGeneralLedger, printFinancialStatements };
}
