"use client";

import {
  buildFiscalPeriodReport,
  FISCAL_PERIOD_REPORT_KINDS,
  FISCAL_PERIOD_REPORT_LABELS,
  type FiscalPeriod,
} from "@rubydogjp/openkk-driver";
import {
  useOpenkkAssist,
  useOpenkkEntries,
  usePrintDocument,
} from "../bindings/index.js";

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

  return FISCAL_PERIOD_REPORT_KINDS.map((kind) => ({
    ...FISCAL_PERIOD_REPORT_LABELS[kind],
    print: () => {
      if (fiscalPeriod == null) return;
      printDocument(
        buildFiscalPeriodReport(kind, {
          fiscalPeriod,
          entries: entriesState.listFiscalPeriodEntries(fiscalPeriod.id),
          assets: assistState.listFixedAssets(fiscalPeriod.id),
          carryovers: assistState.listOpeningCarryovers(fiscalPeriod.id),
        }),
      );
    },
  }));
}
