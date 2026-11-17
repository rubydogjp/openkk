"use client";

import { useEffect, useRef } from "react";

import {
  AppError,
  isCurrentMonthWithinFiscalPeriod,
  type StepTrendPoint,
} from "@rubydogjp/openkk-driver";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkCallout,
  useOpenkkClosing,
  useOpenkkConfig,
  useOpenkkToday,
} from "../../bindings/index.js";
import { fontSize, fontWeight, palette } from "../../shared/design-tokens.js";
import { useConfirmDialog } from "../../shared/confirm-dialog.js";
import { LockButton } from "../../shared/locked-action.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  JournalizingNotStartedTrendChart,
  JournalizingCompletedTrendChart,
  JournalizingCurrentTrendChart,
} from "../step-trend-charts.js";
import {
  StepCallout,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
  StepSpacer,
} from "../step-ui.js";
import { useRouter } from "../../routing/routing.js";
import { usePeriodScopedError } from "../period-scoped-error.js";

export function JournalizingBody({
  onSwitchToStep,
  onBusyChange,
  trendPoints,
}: {
  onSwitchToStep: (no: number) => void;
  onBusyChange: (busy: boolean) => void;
  trendPoints: StepTrendPoint[];
}) {
  const router = useRouter();
  const config = useOpenkkConfig();
  const today = useOpenkkToday();
  const appState = useOpenkkAppState();
  const closingApi = useOpenkkClosing();
  const preClosingHint = useOpenkkCallout("stepJournalizingPreClosingHint");
  const currentFiscalPeriod = appState.currentFiscalPeriod;
  const [screenError, setScreenError] = usePeriodScopedError(
    currentFiscalPeriod?.id ?? null,
  );

  const isPreClosed =
    currentFiscalPeriod?.phase === "pre_closing" ||
    currentFiscalPeriod?.phase === "post_closing";
  useEffect(() => {
    if (isPreClosed) onBusyChange(false);
  }, [isPreClosed, onBusyChange]);
  useEffect(() => {
    return () => onBusyChange(false);
  }, [onBusyChange]);
  const { confirm, dialog } = useConfirmDialog();
  const preClosingLock = useRef(new ExclusiveActionLock());
  const editingLocked = config.editingPolicy.locked;

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  if (!currentFiscalPeriod.openingBalancesCompleted) {
    return (
      <>
        <StepCallout tone="warning">この手順はまだ進められません。</StepCallout>
        <StepSpacer height={null} />
        <section>
          <StepSectionLabel>記帳中</StepSectionLabel>
          <JournalizingNotStartedTrendChart points={trendPoints} />
        </section>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <StepSecondaryButton onClick={() => onSwitchToStep(2)}>
            前の手順へ
          </StepSecondaryButton>
        </div>
      </>
    );
  }

  const isMidPeriod = isCurrentMonthWithinFiscalPeriod(
    currentFiscalPeriod.startDate,
    currentFiscalPeriod.endDate,
    today,
  );

  const handleRunPreClosing = async () => {
    const release = preClosingLock.current.tryAcquire();
    if (release == null) return;
    try {
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
      if (isMidPeriod) {
        const forceConfirmed = await confirm({
          tone: "danger",
          title: "期中の仮締め",
          body: [
            "現在日付はまだこの期間の途中です。通常は翌2月ごろに実行される操作です。",
          ],
          confirmLabel: "実行する",
        });
        if (!forceConfirmed) return;
      }
      onBusyChange(true);
      try {
        await closingApi.runPreClosing(currentFiscalPeriod.id);
        setScreenError(null);
      } catch (error) {
        onBusyChange(false);
        setScreenError(
          AppError.from(error, {
            fallbackUserMessage: "仮締めできませんでした",
            fallbackDeveloperMessage: "steps/journalizing: pre-closing failed",
            statusCode: null,
          }),
        );
      }
    } finally {
      release();
    }
  };

  return (
    <>
      {dialog}

      {isPreClosed ? (
        <section>
          <StepSectionLabel>記録終了</StepSectionLabel>
          {trendPoints.length > 0 ? (
            <JournalizingCompletedTrendChart points={trendPoints} />
          ) : null}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <StepPrimaryButton
              describedBy={null}
              onClick={() => onSwitchToStep(4)}
              disabled={false}
              variant={null}
              icon={null}
            >
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
            <div>
              {editingLocked
                ? "記録された取引を「仕訳」で確認できます。"
                : "この期間の取引を「仕訳」で入力してください"}
            </div>
          </StepCallout>

          {trendPoints.length > 0 ? (
            <>
              <StepSpacer height={null} />
              <section>
                <StepSectionLabel>記帳中</StepSectionLabel>
                <JournalizingCurrentTrendChart points={trendPoints} />
              </section>
            </>
          ) : null}

          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <StepPrimaryButton
              describedBy={null}
              onClick={() => router.push("/entries")}
              disabled={false}
              variant={null}
              icon={null}
            >
              仕訳へ移動
            </StepPrimaryButton>
          </div>

          <StepSpacer height={null} />
          <section>
            <StepSectionLabel>記録を終了</StepSectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {!editingLocked ? (
                <div
                  style={{
                    fontSize: fontSize.base,
                    color: palette.textSoft,
                    lineHeight: 1.75,
                  }}
                >
                  翌2月ごろに今期の取引が全て確定したら仮締めを実行して下さい。
                </div>
              ) : null}
              {preClosingHint != null ? (
                <StepCallout tone="info">{preClosingHint}</StepCallout>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {editingLocked ? (
                  <LockButton label="仮締めを実行" />
                ) : isMidPeriod ? (
                  <StepSecondaryButton onClick={handleRunPreClosing}>
                    仮締めを実行
                  </StepSecondaryButton>
                ) : (
                  <StepPrimaryButton
                    describedBy={null}
                    onClick={handleRunPreClosing}
                    disabled={false}
                    variant="success"
                    icon={null}
                  >
                    仮締めを実行
                  </StepPrimaryButton>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText
            error={screenError}
            style={null}
            fallbackUserMessage={null}
          />
        </div>
      ) : null}
    </>
  );
}
