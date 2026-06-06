"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

import {
  useOpenkkAppState,
  useOpenkkEntries,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import {
  deriveSteps,
  buildStepTrendPoints,
} from "@rubydogjp/openkk-client-domain";
import { normalizePathname } from "../../shared/pathname";
import { StepsPageScreen } from "../../steps/step-page-screen";
import { ArchivedFiscalPeriodScreen } from "./archived-fiscal-period-screen";

const STEPPER_PASSTHROUGH_PATHS = new Set<string>([
  "/steps/journalizing/analytics",
]);

export function StepsLayout({ children }: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname());
  if (STEPPER_PASSTHROUGH_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return <StepsStepperHost />;
}

function StepsStepperHost() {
  const appState = useOpenkkAppState();
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  if (currentFiscalPeriod == null) {
    return (
      <section style={{ padding: 24 }}>
        <div style={{ color: "var(--muted)" }}>期間を選択してください</div>
      </section>
    );
  }

  if (currentFiscalPeriod.archiveStatus === "archived") {
    return <ArchivedFiscalPeriodScreen fiscalPeriod={currentFiscalPeriod} />;
  }

  const steps = deriveSteps({
    settingsCompleted: currentFiscalPeriod.settingsCompleted,
    openingBalancesCompleted: currentFiscalPeriod.openingBalancesCompleted,
    hasAnyClosing:
      currentFiscalPeriod.phase === "pre_closing" ||
      currentFiscalPeriod.phase === "post_closing",
    hasFinalClosing: currentFiscalPeriod.phase === "post_closing",
    hasReceivedDocuments: currentFiscalPeriod.documentsReceivedCompleted,
  });

  return (
    <StepsPageScreenWithChart
      steps={steps}
      currentFiscalPeriodId={currentFiscalPeriod.id}
      currentStartDate={currentFiscalPeriod.startDate}
      currentEndDate={currentFiscalPeriod.endDate}
    />
  );
}

function StepsPageScreenWithChart({
  steps,
  currentFiscalPeriodId,
  currentStartDate,
  currentEndDate,
}: {
  steps: ReturnType<typeof deriveSteps>;
  currentFiscalPeriodId: string;
  currentStartDate: string;
  currentEndDate: string;
}) {
  const entriesState = useOpenkkEntries();
  const openkkConfig = useOpenkkConfig();
  const trendPoints = useMemo(
    () =>
      buildStepTrendPoints({
        entries: entriesState.listFiscalPeriodEntries(currentFiscalPeriodId),
        startDate: currentStartDate,
        endDate: currentEndDate,

        today: openkkConfig.today,
      }),
    [entriesState, openkkConfig, currentFiscalPeriodId, currentStartDate, currentEndDate],
  );
  return <StepsPageScreen items={steps} trendPoints={trendPoints} />;
}
