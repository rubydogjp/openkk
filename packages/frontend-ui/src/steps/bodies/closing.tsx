"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  buildFinalClosingPayload,
  computeFsAggregate,
  withClosingVirtualEntries,
} from "@rubydogjp/openkk-driver";
import { AppErrorText, debugAppError } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkClosing,
  useOpenkkConfig,
  useOpenkkEntries,
} from "../../bindings/index.js";
import { formatDateButtonLabel } from "../../shared/date-picker.js";
import { palette } from "../../shared/design-tokens.js";
import { CheckCircleIcon } from "../../shared/icons.js";
import { useConfirmDialog } from "../../shared/confirm-dialog.js";
import { PlBsDiagramSection } from "../../shared/pl-bs-diagram.js";
import { DocumentFileList } from "../../shared/document-file-tile.js";
import { useStepDocuments } from "../use-step-documents.js";
import { ClosingExplainerAnimation } from "../closing-animation.js";
import { LockButton } from "../../shared/locked-action.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  ActionChoiceCard,
  ActionGrid,
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
  StepSpacer,
  StepUnavailableNotice,
  UndoIcon,
} from "../step-ui.js";
import { usePeriodScopedError } from "../period-scoped-error.js";
import { usePrefersReducedMotion } from "../../shared/reduced-motion.js";

const CLOSED_BUT_NOT_READ_BACK_MESSAGE =
  "本締めは済みました。画面を読み込み直してください";

export function ClosingBody({
  onSwitchToStep,
  onBusyChange,
}: {
  onSwitchToStep: (no: number) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const appState = useOpenkkAppState();
  const config = useOpenkkConfig();
  const editingLocked = config.editingPolicy.locked;
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const closingApi = useOpenkkClosing();
  const { confirm, dialog } = useConfirmDialog();
  const [showRunningAnimation, setShowRunningAnimation] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const runningSectionRef = useRef<HTMLElement>(null);
  const resultSectionRef = useRef<HTMLElement>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [animationEnded, setAnimationEnded] = useState(false);
  const closingMutationLock = useRef(new ExclusiveActionLock());
  const currentFiscalPeriod = appState.currentFiscalPeriod;
  const [screenError, setScreenError] = usePeriodScopedError(
    currentFiscalPeriod?.id ?? null,
  );
  const documents = useStepDocuments(currentFiscalPeriod);

  useEffect(() => {
    return () => onBusyChange(false);
  }, [onBusyChange]);

  const recordsLoaded =
    entriesState.loadError == null && assistState.loadError == null;
  const fsSummary = useMemo(() => {
    if (currentFiscalPeriod == null || !recordsLoaded) return null;
    const entries = withClosingVirtualEntries({
      fiscalPeriodId: currentFiscalPeriod.id,
      phase: currentFiscalPeriod.phase,
      periodStartDate: currentFiscalPeriod.startDate,
      periodEndDate: currentFiscalPeriod.endDate,
      entries: entriesState.listFiscalPeriodEntries(currentFiscalPeriod.id),
      assets: assistState.listFixedAssets(currentFiscalPeriod.id),
      carryovers: assistState.listOpeningCarryovers(currentFiscalPeriod.id),
    });
    return computeFsAggregate({
      entries,
      openingBalanceLines: currentFiscalPeriod.opening.balanceLines,
    }).summary;
  }, [currentFiscalPeriod, entriesState, assistState, recordsLoaded]);

  const closingResultShown =
    !showRunningAnimation &&
    currentFiscalPeriod?.phase === "post_closing" &&
    fsSummary != null;
  useEffect(() => {
    if (closingResultShown) onBusyChange(false);
  }, [closingResultShown, onBusyChange]);

  useEffect(() => {
    if (showRunningAnimation) runningSectionRef.current?.focus();
  }, [showRunningAnimation]);

  useEffect(() => {
    if (showRunningAnimation && animationEnded && !isFinalizing) {
      setShowRunningAnimation(false);
    }
  }, [showRunningAnimation, animationEnded, isFinalizing]);

  const [resultFocusPending, setResultFocusPending] = useState(false);
  const [closedInThisVisit, setClosedInThisVisit] = useState(false);
  useEffect(() => {
    if (!closingResultShown || !resultFocusPending) return;
    resultSectionRef.current?.focus();
    setResultFocusPending(false);
  }, [closingResultShown, resultFocusPending]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const isClosed = currentFiscalPeriod.phase === "post_closing";
  const isPreClosed = currentFiscalPeriod.phase === "pre_closing";
  const canEnterPage = isPreClosed || isClosed;

  const handleCancelPreClosing = async () => {
    const release = closingMutationLock.current.tryAcquire();
    if (release == null) return;
    try {
      const confirmed = await confirm({
        tone: "danger",
        title: "仮締めの取り消し",
        body: [
          "1つ前の手順に戻り、ロックを解除して再び編集できるようにします。",
        ],
        confirmLabel: "取り消す",
      });
      if (!confirmed) return;
      try {
        await closingApi.cancelPreClosing(currentFiscalPeriod.id);
        setScreenError(null);
      } catch (error) {
        setScreenError(
          AppError.from(error, {
            fallbackUserMessage: "仮締めの取り消しに失敗しました",
            fallbackDeveloperMessage:
              "steps/closing: cancel pre-closing failed",
            statusCode: null,
          }),
        );
      }
    } finally {
      release();
    }
  };

  const handleFinalize = async () => {
    const release = closingMutationLock.current.tryAcquire();
    if (release == null) return;
    try {
      const confirmed = await confirm({
        tone: "danger",
        title: "本締め",
        body: [
          "この操作は取り消せません。",
          "仮書類を十分にプレビューし、間違いがないことをチェックしたうえで実行してください。",
        ],
        confirmLabel: "実行する",
      });
      if (!confirmed) return;

      onBusyChange(true);
      setIsFinalizing(true);
      setAnimationEnded(prefersReducedMotion);
      setShowRunningAnimation(true);
      setResultFocusPending(true);
      setAnimationKey((key) => key + 1);
      try {
        const entries = buildFinalClosingPayload(
          {
            fiscalPeriod: currentFiscalPeriod,
            entries: entriesState.listFiscalPeriodEntries(
              currentFiscalPeriod.id,
            ),
            assets: assistState.listFixedAssets(currentFiscalPeriod.id),
            carryovers: assistState.listOpeningCarryovers(
              currentFiscalPeriod.id,
            ),
          },
          entriesState.journalTableMaster,
        );
        await closingApi.runFinal(currentFiscalPeriod.id, entries);
      } catch (error) {
        setIsFinalizing(false);
        setShowRunningAnimation(false);
        onBusyChange(false);
        setResultFocusPending(false);
        setScreenError(
          AppError.from(error, {
            fallbackUserMessage: "本締めに失敗しました",
            fallbackDeveloperMessage: "steps/closing: finalize failed",
            statusCode: null,
          }),
        );
        return;
      }
      try {
        await entriesState.reloadAndWait();
        setScreenError(null);
        setClosedInThisVisit(true);
        setIsFinalizing(false);
      } catch (error) {
        debugAppError(error);
        setIsFinalizing(false);
        setShowRunningAnimation(false);
        onBusyChange(false);
        setScreenError(
          new AppError({
            messageForDeveloper:
              "steps/closing: closed but the entries could not be read back",
            messageForUser: CLOSED_BUT_NOT_READ_BACK_MESSAGE,
            originalMessage: null,
            statusCode: null,
            code: null,
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

      {!canEnterPage ? (
        <StepUnavailableNotice editingPolicy={config.editingPolicy} />
      ) : null}

      <StepMetaCard>
        <StepMetaRow
          label="期間の名称"
          value={currentFiscalPeriod.name}
          divider={false}
        />
        <StepMetaRow
          label="期間"
          value={`${formatDateButtonLabel(currentFiscalPeriod.startDate)} 〜 ${formatDateButtonLabel(currentFiscalPeriod.endDate)}`}
          divider
        />
      </StepMetaCard>
      {!canEnterPage ? (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <StepSecondaryButton onClick={() => onSwitchToStep(3)}>
            前の手順へ
          </StepSecondaryButton>
        </div>
      ) : null}

      {isPreClosed && !showRunningAnimation ? (
        <>
          <StepSpacer height={null} />
          <section>
            <StepSectionLabel>仮書類をチェック</StepSectionLabel>
            <DocumentFileList
              actionLabel="確認する"
              items={documents.map((stepDocument) => ({
                label: `仮_${stepDocument.name}.pdf`,
                description: stepDocument.description,
                active: stepDocument.available,
                onClick: stepDocument.available ? stepDocument.print : null,
              }))}
            />
          </section>
        </>
      ) : null}

      <p role="status" className="bk-visually-hidden">
        {showRunningAnimation
          ? "本締めを実行しています"
          : closingResultShown && closedInThisVisit
            ? "本締めが済みました"
            : ""}
      </p>

      {showRunningAnimation ? (
        <>
          <StepSpacer height={null} />
          <section
            ref={runningSectionRef}
            tabIndex={-1}
            aria-label="本締めを実行しています"
            style={{ outline: "none" }}
          >
            <StepSectionLabel>実行中</StepSectionLabel>

            {prefersReducedMotion ? (
              <p style={{ margin: 0, color: palette.textSoft }}>
                本締めを実行しています…
              </p>
            ) : (
              <ClosingExplainerAnimation
                key={animationKey}
                onCompleted={() => {
                  setAnimationEnded(true);
                }}
              />
            )}
          </section>
        </>
      ) : null}

      {isClosed && !showRunningAnimation && fsSummary != null ? (
        <>
          <StepSpacer height={null} />
          <section
            ref={resultSectionRef}
            tabIndex={-1}
            aria-label="財務諸表の概要"
            style={{ outline: "none" }}
          >
            <StepSectionLabel>財務諸表の概要</StepSectionLabel>

            <PlBsDiagramSection pl={fsSummary} bs={fsSummary} />
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <StepPrimaryButton
                describedBy={null}
                onClick={() => onSwitchToStep(5)}
                disabled={false}
                variant={null}
                icon={null}
              >
                次の手順へ
              </StepPrimaryButton>
            </div>
          </section>
        </>
      ) : null}

      {isPreClosed && !showRunningAnimation ? (
        <>
          <StepSpacer height={null} />
          <section>
            <StepSectionLabel>選択</StepSectionLabel>
            <ActionGrid>
              <ActionChoiceCard
                icon={<UndoIcon color={palette.textLabel} />}
                title="前の手順に戻る"
                description="書類に問題が見つかった場合、仮締めを取り消します。ロックは解除され、仕訳データを再編集できるようになります。"
                action={
                  editingLocked ? (
                    <LockButton label="取り消す" />
                  ) : (
                    <StepSecondaryButton onClick={handleCancelPreClosing}>
                      取り消す
                    </StepSecondaryButton>
                  )
                }
              />
              <ActionChoiceCard
                icon={<CheckCircleIcon size={16} color={palette.success} />}
                title="本締めを実行する"
                description="書類に問題がなかった場合、本締めを実行します。仕訳データは確定され、編集ができなくなります。"
                action={
                  editingLocked ? (
                    <LockButton label="本締めを実行" />
                  ) : (
                    <StepPrimaryButton
                      describedBy={null}
                      onClick={handleFinalize}
                      disabled={false}
                      variant="success"
                      icon={null}
                    >
                      本締めを実行
                    </StepPrimaryButton>
                  )
                }
              />
            </ActionGrid>
          </section>
        </>
      ) : null}

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
