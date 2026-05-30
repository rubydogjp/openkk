"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  useOpenkkAppState,
  useOpenkkClosing,
  useOpenkkEntries,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import {
  deriveSteps,
  buildStepTrendPoints,
} from "@rubydogjp/openkk-client-domain";
import { normalizePathname } from "../../shared/pathname";
import { StepsPageScreen } from "../../steps/step-page-screen";

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
  const openkkConfig = useOpenkkConfig();
  const closingApi = useOpenkkClosing();
  const [hasAnyClosingRemote, setHasAnyClosingRemote] = useState(false);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  useEffect(() => {
    if (
      openkkConfig.isMockMode ||
      currentFiscalPeriod == null ||
      appState.currentFiscalPeriodId == null
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        const closing = await closingApi.getProvisional(appState.currentFiscalPeriodId!, year);
        if (cancelled) return;
        setHasAnyClosingRemote(closing != null);
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    appState.currentFiscalPeriodId,
    currentFiscalPeriod?.endDate,
    currentFiscalPeriod?.id,
  ]);

  if (currentFiscalPeriod == null) {
    return (
      <section style={{ padding: 24 }}>
        <div style={{ color: "var(--muted)" }}>期間を選択してください</div>
      </section>
    );
  }

  const currentPeriodEndYear = Number(currentFiscalPeriod.endDate.slice(0, 4));
  const hasNextFiscalPeriod = appState.fiscalPeriods.some((period) => {
    if (period.id === currentFiscalPeriod.id) return false;
    return Number(period.endDate.slice(0, 4)) === currentPeriodEndYear + 1;
  });

  const steps = deriveSteps({
    settingsCompleted: currentFiscalPeriod.settingsCompleted,
    openingBalancesCompleted: currentFiscalPeriod.openingBalancesCompleted,
    hasAnyClosing: openkkConfig.isMockMode
      ? currentFiscalPeriod.provisionalClosingCompleted ||
        currentFiscalPeriod.stage === "post_closing"
      : hasAnyClosingRemote || currentFiscalPeriod.stage === "post_closing",
    hasFinalClosing: currentFiscalPeriod.stage === "post_closing",
    hasReceivedDocuments: currentFiscalPeriod.documentsReceivedCompleted,
    hasNextFiscalPeriod,
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
