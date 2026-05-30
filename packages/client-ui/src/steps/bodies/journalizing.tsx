"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
import {
  useOpenkkAppState,
  useOpenkkClosing,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { fontSize, fontWeight, palette } from "../../shared/design-tokens";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { isCurrentMonthWithinFiscalPeriod } from "@rubydogjp/openkk-client-domain";
import {
  JournalizingNotStartedTrendChart,
  JournalizingCompletedTrendChart,
  Step3TrendChart,
} from "../step-trend-charts";
import type { StepTrendPoint } from "@rubydogjp/openkk-client-domain";
import {
  StepDivider,
  StepCallout,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
} from "../step-ui";

export function JournalizingBody({
  onSwitchToStep,
  trendPoints,
}: {
  onSwitchToStep?: (no: number) => void;
  trendPoints?: StepTrendPoint[];
}) {
  const router = useRouter();
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  const closingApi = useOpenkkClosing();
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const { confirm, dialog } = useConfirmDialog();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isProvisionalClosedRemote, setIsProvisionalClosedRemote] =
    useState(false);

  useEffect(() => {
    if (
      config.isMockMode ||
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
        setIsProvisionalClosedRemote(closing?.isProvisional === true);
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
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  if (!currentFiscalPeriod.openingBalancesCompleted) {
    return (
      <>
        <StepCallout tone="warning">
          この手順はまだ進められません。
        </StepCallout>
        <StepDivider />
        <section>
          <StepSectionLabel>記録中</StepSectionLabel>
          <JournalizingNotStartedTrendChart points={trendPoints} />
        </section>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <StepSecondaryButton onClick={() => onSwitchToStep?.(2)}>
            前の手順へ
          </StepSecondaryButton>
        </div>
      </>
    );
  }

  const isProvisionalClosed =
    currentFiscalPeriod.stage === "post_closing" ||
    (config.isMockMode
      ? currentFiscalPeriod.provisionalClosingCompleted
      : isProvisionalClosedRemote);

  const handleRunProvisional = async () => {
    const confirmed = await confirm({

      tone: "success",
      title: "仮締め",
      body: [
        "今期の取引記録を確定します。",
        "編集はロックされますが、確認してから解除することができます。",
      ],
      confirmLabel: "実行する",
    });
    if (!confirmed) return;
    if (
      isCurrentMonthWithinFiscalPeriod(
        currentFiscalPeriod.startDate,
        currentFiscalPeriod.endDate,
        config.today,
      )
    ) {
      const forceConfirmed = await confirm({

        tone: "danger",
        title: "まだ期中です",
        body: [
          "現在日付はまだこの期間の途中です。通常は翌2月頃に実行される操作です。",
          "内容を確認したうえで、そのまま進める場合のみ実行してください。",
        ],
        confirmLabel: "実行する",
      });
      if (!forceConfirmed) return;
    }
    try {
      if (config.isMockMode) {
        const updated = await appState.updateFiscalPeriod(
          currentFiscalPeriod.id,
          { provisionalClosingCompleted: true },
        );
        if (!updated) return;
      } else if (appState.currentFiscalPeriodId != null) {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.runProvisional(appState.currentFiscalPeriodId, year);
        setIsProvisionalClosedRemote(true);
      }
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "仮締めの更新に失敗しました",
          fallbackDeveloperMessage:
            "steps/journalizing: provisional close failed",
        }),
      );
    }
  };

  return (
    <>
      {dialog}

      {isProvisionalClosed ? (
        <section>
          <StepSectionLabel>記録終了</StepSectionLabel>
          {trendPoints != null && trendPoints.length > 0 ? (
            <JournalizingCompletedTrendChart
              points={trendPoints}
            />
          ) : null}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <StepPrimaryButton onClick={() => onSwitchToStep?.(4)}>
              次の手順へ
            </StepPrimaryButton>
          </div>
        </section>
      ) : (
        <>

          <StepCallout tone="action">
            <div style={{ fontWeight: fontWeight.bold, color: palette.text }}>
              ヒント
            </div>
            <div>1月~12月の取引を「仕訳タブ」で入力して下さい</div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 4,
              }}
            >
              <StepPrimaryButton onClick={() => router.push("/entries")}>
                仕訳タブへ移動
              </StepPrimaryButton>
            </div>
          </StepCallout>

          {trendPoints != null && trendPoints.length > 0 ? (
            <>
              <StepDivider />
              <section>
                <StepSectionLabel>記録中</StepSectionLabel>
                <Step3TrendChart
                  points={trendPoints}
                  detailsHref="/steps/journalizing/analytics"
                />
              </section>
            </>
          ) : null}

          <StepDivider />
          <section>
            <StepSectionLabel>記録を終了</StepSectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  fontSize: fontSize.base,
                  color: palette.textSoft,
                  lineHeight: 1.75,
                }}
              >
                翌2月ごろに今期の取引が全て確定したら仮締めを実行して下さい。
              </div>
              {config.isDemoMode ? (
                <StepCallout tone="info">
                  ※ デモ版では、いきなり仮締めを実行して構いません。
                </StepCallout>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <StepPrimaryButton
                  onClick={handleRunProvisional}
                  variant="success"
                >
                  仮締めを実行
                </StepPrimaryButton>
              </div>
            </div>
          </section>
        </>
      )}

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText error={screenError} />
        </div>
      ) : null}
    </>
  );
}
