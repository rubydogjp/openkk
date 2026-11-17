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
  useOpenkkToday,
  usePrintDocument,
} from "../bindings/index.js";

export type StepDocument = {
  name: string;
  description: string;
  available: boolean;
  print: () => void;
};

export function useStepDocuments(
  fiscalPeriod: FiscalPeriod | null,
): StepDocument[] {
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const printDocument = usePrintDocument();
  const today = useOpenkkToday();

  const available =
    fiscalPeriod != null &&
    entriesState.loadError == null &&
    assistState.loadError == null &&
    entriesState.isFiscalPeriodLoaded(fiscalPeriod.id) &&
    assistState.areFixedAssetsLoaded(fiscalPeriod.id);

  return FISCAL_PERIOD_REPORT_KINDS.map((kind) => ({
    ...FISCAL_PERIOD_REPORT_LABELS[kind],
    available,
    print: () => {
      if (fiscalPeriod == null || !available) return;
      printDocument(
        buildFiscalPeriodReport(
          kind,
          {
            fiscalPeriod,
            entries: entriesState.listFiscalPeriodEntries(fiscalPeriod.id),
            assets: assistState.listFixedAssets(fiscalPeriod.id),
            carryovers: assistState.listOpeningCarryovers(fiscalPeriod.id),
          },
          today,
        ),
      );
    },
  }));
}
