"use client";

import { usePathname } from "next/navigation.js";
import { useMemo } from "react";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkEntries,
  useOpenkkToday,
} from "@rubydogjp/openkk-client-usecases";
import {
  deriveSteps,
  buildAnalyticsEntries,
  buildStepTrendPoints,
} from "@rubydogjp/openkk-client-domain";
import { normalizePathname } from "../../shared/pathname.js";
import { StepsPageScreen } from "../../steps/step-page-screen.js";
import { ArchivedFiscalPeriodScreen } from "./archived-fiscal-period-screen.js";

const STEPPER_PASSTHROUGH_PATHS = new Set<string>([
  "/steps/journalizing/analytics",
]);

export function StepsLayout({ children }: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname());
  if (STEPPER_PASSTHROUGH_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return <StepsStepperHost pathname={pathname} />;
}

function StepsStepperHost({ pathname }: { pathname: string }) {
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

  if (
    currentFiscalPeriod.archiveStatus === "archived" &&
    pathname !== "/steps/next-fiscal-period"
  ) {
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
  const assistState = useOpenkkAssist();
  const today = useOpenkkToday();
  const trendPoints = useMemo(
    () =>
      buildStepTrendPoints({
        entries: buildAnalyticsEntries({
          fiscalPeriodId: currentFiscalPeriodId,
          periodStartDate: currentStartDate,
          periodEndDate: currentEndDate,
          entries: entriesState.listFiscalPeriodEntries(currentFiscalPeriodId),
          assets: assistState.listFixedAssets(currentFiscalPeriodId),
          carryovers: assistState.listOpeningCarryovers(currentFiscalPeriodId),
        }),
        startDate: currentStartDate,
        endDate: currentEndDate,

        today,
      }),
    [
      entriesState,
      assistState,
      today,
      currentFiscalPeriodId,
      currentStartDate,
      currentEndDate,
    ],
  );
  return <StepsPageScreen items={steps} trendPoints={trendPoints} />;
}
