"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  buildClosingVirtualEntries,
  computeFsAggregate,
  resolveEditingPolicy,
  withClosingVirtualEntries,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkClosing,
  useOpenkkConfig,
  useOpenkkEntries,
} from "@rubydogjp/openkk-client-usecases";
import { formatDateButtonLabel } from "../../shared/date-picker.js";
import { palette } from "../../shared/design-tokens.js";
import { useConfirmDialog } from "../../shared/confirm-dialog.js";
import { PlBsDiagramSection } from "../../shared/pl-bs-diagram.js";
import { DocumentFileList } from "../../shared/document-file-tile.js";
import { useStepDocumentPrinters } from "../use-step-document-printers.js";
import { ClosingExplainerAnimation } from "../closing-animation.js";
import { LockButton } from "../../shared/lock-icon.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  ActionChoiceCard,
  ActionGrid,
  CheckCircleIcon,
  StepDivider,
  StepCallout,
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
  UndoIcon,
} from "../step-ui.js";

export function ClosingBody({
  onSwitchToStep,
  onBusyChange,
}: {
  onSwitchToStep: ((no: number) => void) | null;
  onBusyChange: ((busy: boolean) => void) | null;
}) {
  const appState = useOpenkkAppState();
  const config = useOpenkkConfig();
  const editingLocked = resolveEditingPolicy(config).locked;
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const closingApi = useOpenkkClosing();
  const { confirm, dialog } = useConfirmDialog();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [showRunningAnimation, setShowRunningAnimation] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const closingMutationLock = useRef(new ExclusiveActionLock());
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const { printJournal, printGeneralLedger, printFinancialStatements } =
    useStepDocumentPrinters(currentFiscalPeriod ?? null);

  useEffect(() => {
    return () => onBusyChange?.(false);
  }, [onBusyChange]);

  const fsSummary = useMemo(() => {
    if (currentFiscalPeriod == null) return null;
    const entries = withClosingVirtualEntries({
      fiscalPeriodId: currentFiscalPeriod.id,
      periodStartDate: currentFiscalPeriod.startDate,
      periodEndDate: currentFiscalPeriod.endDate,
      entries: entriesState.listFiscalPeriodEntries(currentFiscalPeriod.id),
      assets: assistState.listFixedAssets(currentFiscalPeriod.id),
      carryovers: assistState.listOpeningCarryovers(currentFiscalPeriod.id),
    });
    return computeFsAggregate({
      entries,
      openingBalanceLines:
        currentFiscalPeriod.opening?.openingBalanceLines ?? [],
    }).summary;
  }, [currentFiscalPeriod, entriesState, assistState]);

  const closingResultShown =
    !showRunningAnimation &&
    currentFiscalPeriod?.phase === "post_closing" &&
    fsSummary != null;
  useEffect(() => {
    if (closingResultShown) onBusyChange?.(false);
  }, [closingResultShown, onBusyChange]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const isClosed = currentFiscalPeriod.phase === "post_closing";
  const isPreClosed = currentFiscalPeriod.phase === "pre_closing";
  const canFinalize = isPreClosed && !isClosed;
  const canEnterPage = isPreClosed || isClosed;
  const isBusy = showRunningAnimation;

  const handleCancelPreClosing = async () => {
    const release = closingMutationLock.current.tryAcquire();
    if (release == null) return;
    try {
      const confirmed = await confirm({
        tone: "danger",
        title: "仮締めを取り消す",
        body: [
          "1つ前の手順に戻り、ロックを解除して再び編集できるようにします。",
        ],
        confirmLabel: "取り消す",
        cancelLabel: null,
      });
      if (!confirmed) return;
      try {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.cancelPreClosing(currentFiscalPeriod.id, year);
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
          "仮書類を十分にプレビューし、間違いがないことをチェックした上で実行してください。",
        ],
        confirmLabel: "実行する",
        cancelLabel: null,
      });
      if (!confirmed) return;

      onBusyChange?.(true);
      setShowRunningAnimation(true);
      setAnimationKey((k) => k + 1);
      try {
        const entries = prepareAssistEntriesForFinalClosing({
          fiscalPeriodId: currentFiscalPeriod.id,
          periodStartDate: currentFiscalPeriod.startDate,
          periodEndDate: currentFiscalPeriod.endDate,
          assistState,
          entriesState,
        });
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.runFinal(currentFiscalPeriod.id, year, entries);
        await entriesState.reloadAndWait();
        setScreenError(null);
      } catch (error) {
        setShowRunningAnimation(false);
        onBusyChange?.(false);
        setScreenError(
          AppError.from(error, {
            fallbackUserMessage: "本締めに失敗しました",
            fallbackDeveloperMessage: "steps/closing: finalize failed",
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

      {!canEnterPage ? (
        <>
          <StepCallout tone="warning">
            この手順はまだ進められません。
          </StepCallout>
          <StepDivider marginY={null} />
        </>
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
          <StepSecondaryButton
            onClick={() => onSwitchToStep?.(3)}
            disabled={false}
          >
            前の手順へ
          </StepSecondaryButton>
        </div>
      ) : null}

      {canFinalize && !isBusy ? (
        <>
          <StepDivider marginY={null} />
          <section>
            <StepSectionLabel>仮書類をチェック</StepSectionLabel>
            <DocumentFileList
              actionLabel="確認する"
              items={[
                { label: "仮_仕訳帳.pdf", onClick: printJournal, description: null, active: true },
                { label: "仮_総勘定元帳.pdf", onClick: printGeneralLedger, description: null, active: true },
                { label: "仮_財務諸表.pdf", onClick: printFinancialStatements, description: null, active: true },
              ]}
            />
          </section>
        </>
      ) : null}

      {showRunningAnimation ? (
        <>
          <StepDivider marginY={null} />
          <section>
            <StepSectionLabel>実行中</StepSectionLabel>

            <ClosingExplainerAnimation
              key={animationKey}
              onCompleted={() => {
                setShowRunningAnimation(false);
              }}
            />
          </section>
        </>
      ) : null}

      {isClosed && !showRunningAnimation && fsSummary != null ? (
        <>
          <StepDivider marginY={null} />
          <section>
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
                onClick={() => onSwitchToStep?.(5)}
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

      {canFinalize && !isBusy ? (
        <>
          <StepDivider marginY={null} />
          <section>
            <StepSectionLabel>選択</StepSectionLabel>
            <ActionGrid columns={2}>
              <ActionChoiceCard
                icon={<UndoIcon color={palette.textLabel} />}
                title="前の手順に戻る"
                description="書類に問題が見つかった場合、仮締めを取り消します。ロックは解除され、仕訳データを再編集できるようになります。"
                action={
                  editingLocked ? (
                    <LockButton label="取り消す" style={null} />
                  ) : (
                    <StepSecondaryButton
                      onClick={handleCancelPreClosing}
                      disabled={false}
                    >
                      取り消す
                    </StepSecondaryButton>
                  )
                }
              />
              <ActionChoiceCard
                icon={<CheckCircleIcon color={palette.success} />}
                title="本締めを実行する"
                description="書類に問題がなかった場合、本締めを実行します。仕訳データは確定され、編集ができなくなります。"
                action={
                  editingLocked ? (
                    <LockButton label="本締めを実行" style={null} />
                  ) : (
                    <StepPrimaryButton
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
          <AppErrorText error={screenError} style={null} fallbackUserMessage={null} />
        </div>
      ) : null}
    </>
  );
}

function prepareAssistEntriesForFinalClosing(input: {
  fiscalPeriodId: string;
  periodStartDate: string;
  periodEndDate: string;
  assistState: Pick<
    ReturnType<typeof useOpenkkAssist>,
    "listFixedAssets" | "listOpeningCarryovers"
  >;
  entriesState: Pick<
    ReturnType<typeof useOpenkkEntries>,
    "listFiscalPeriodEntries" | "prepareFiscalPeriodEntries"
  >;
}) {
  const manualEntriesForFinalClosing = input.entriesState
    .listFiscalPeriodEntries(input.fiscalPeriodId)
    .filter((entry) => !entry.localId?.startsWith("virtual:"));
  const entries = buildClosingVirtualEntries({
    fiscalPeriodId: input.fiscalPeriodId,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    entries: manualEntriesForFinalClosing,
    assets: input.assistState.listFixedAssets(input.fiscalPeriodId),
    carryovers: input.assistState.listOpeningCarryovers(input.fiscalPeriodId),
  });
  return input.entriesState.prepareFiscalPeriodEntries(entries);
}
