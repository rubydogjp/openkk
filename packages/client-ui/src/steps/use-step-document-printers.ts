"use client";

import {
  buildFinancialStatementsDocument,
  buildGeneralLedgerDocument,
  buildJournalDocument,
  computeFsAggregate,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkEntries,
  usePrintDocument,
} from "@rubydogjp/openkk-client-usecases";

export function useStepDocumentPrinters(
  fiscalPeriod: FiscalPeriod | undefined,
) {
  const entriesState = useOpenkkEntries();
  const printDocument = usePrintDocument();

  const printJournal = () => {
    if (fiscalPeriod == null) return;
    const entries = entriesState.listFiscalPeriodEntries(fiscalPeriod.id);
    printDocument(buildJournalDocument(fiscalPeriod.name, entries));
  };

  const printGeneralLedger = () => {
    if (fiscalPeriod == null) return;
    const entries = entriesState.listFiscalPeriodEntries(fiscalPeriod.id);
    const openingBalanceLines = fiscalPeriod.opening?.openingBalanceLines ?? [];
    printDocument(
      buildGeneralLedgerDocument(
        fiscalPeriod.name,
        entries,
        openingBalanceLines,
      ),
    );
  };

  const printFinancialStatements = () => {
    if (fiscalPeriod == null) return;
    const entries = entriesState.listFiscalPeriodEntries(fiscalPeriod.id);
    const openingBalanceLines = fiscalPeriod.opening?.openingBalanceLines ?? [];
    const { amounts, bsRows, expenseWriteIns } = computeFsAggregate({
      entries,
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
