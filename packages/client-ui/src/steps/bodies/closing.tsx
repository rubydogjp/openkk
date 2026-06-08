"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AppError,
  buildClosingVirtualEntries,
  computeFsAggregate,
  withClosingVirtualEntries,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkClosing,
  useOpenkkEntries,
} from "@rubydogjp/openkk-client-usecases";
import { formatDateButtonLabel } from "../../shared/date-picker";
import { palette } from "../../shared/design-tokens";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { PlBsDiagramSection } from "../../shared/pl-bs-diagram";
import { DocumentFileList } from "../../shared/document-file-tile";
import { useStepDocumentPrinters } from "../use-step-document-printers";
import { ClosingExplainerAnimation } from "../closing-animation";
import {
  ActionChoiceCard,
  ActionGrid,
  CheckIcon,
  StepDivider,
  StepCallout,
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
  UndoIcon,
} from "../step-ui";

export function ClosingBody({
  onSwitchToStep,
  onBusyChange,
}: {
  onSwitchToStep?: (no: number) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const closingApi = useOpenkkClosing();
  const { confirm, dialog } = useConfirmDialog();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [showRunningAnimation, setShowRunningAnimation] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const { printJournal, printGeneralLedger, printFinancialStatements } =
    useStepDocumentPrinters(currentFiscalPeriod);

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
      assets: assistState.listFixedAssets(),
      carryovers: assistState.listOpeningCarryovers(currentFiscalPeriod.id),
    });
    return computeFsAggregate({
      entries,
      openingBalanceLines:
        currentFiscalPeriod.opening?.openingBalanceLines ?? [],
    }).summary;
  }, [currentFiscalPeriod, entriesState, assistState]);

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
    const confirmed = await confirm({
      tone: "danger",
      title: "仮締めを取り消す",
      body: ["1つ前の手順に戻り、ロックを解除して再び編集できるようにします。"],
      confirmLabel: "取り消す",
    });
    if (!confirmed) return;
    try {
      if (appState.currentFiscalPeriodId != null) {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.cancelPreClosing(appState.currentFiscalPeriodId, year);
      }
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "仮締めの取り消しに失敗しました",
          fallbackDeveloperMessage: "steps/closing: cancel pre-closing failed",
        }),
      );
    }
  };

  const handleFinalize = async () => {
    const confirmed = await confirm({
      tone: "danger",
      title: "本締め",
      body: [
        "この操作は取り消せません。",
        "仮書類を十分にプレビューし、間違いがないことをチェックした上で実行してください。",
      ],
      confirmLabel: "実行する",
    });
    if (!confirmed) return;

    onBusyChange?.(true);
    setShowRunningAnimation(true);
    setAnimationKey((k) => k + 1);
    try {
      await materializeAssistEntriesForFinalClosing({
        fiscalPeriodId: currentFiscalPeriod.id,
        periodStartDate: currentFiscalPeriod.startDate,
        periodEndDate: currentFiscalPeriod.endDate,
        assistState,
        entriesState,
      });
      if (appState.currentFiscalPeriodId != null) {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.runFinal(appState.currentFiscalPeriodId, year);
      }
      setScreenError(null);
    } catch (error) {
      setShowRunningAnimation(false);
      onBusyChange?.(false);
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "本締めに失敗しました",
          fallbackDeveloperMessage: "steps/closing: finalize failed",
        }),
      );
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
          <StepDivider />
        </>
      ) : null}

      <StepMetaCard>
        <StepMetaRow label="期間の名称" value={currentFiscalPeriod.name} />
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
          <StepSecondaryButton onClick={() => onSwitchToStep?.(3)}>
            前の手順へ
          </StepSecondaryButton>
        </div>
      ) : null}

      {canFinalize && !isBusy ? (
        <>
          <StepDivider />
          <section>
            <StepSectionLabel>仮書類をチェック</StepSectionLabel>
            <DocumentFileList
              actionLabel="確認する"
              items={[
                { label: "仮_仕訳帳.pdf", onClick: printJournal },
                { label: "仮_総勘定元帳.pdf", onClick: printGeneralLedger },
                { label: "仮_財務諸表.pdf", onClick: printFinancialStatements },
              ]}
            />
          </section>
        </>
      ) : null}

      {showRunningAnimation ? (
        <>
          <StepDivider />
          <section>
            <StepSectionLabel>実行中</StepSectionLabel>

            <ClosingExplainerAnimation
              key={animationKey}
              onCompleted={() => {
                setShowRunningAnimation(false);

                onBusyChange?.(false);
              }}
            />
          </section>
        </>
      ) : null}

      {isClosed && !showRunningAnimation && fsSummary != null ? (
        <>
          <StepDivider />
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
              <StepPrimaryButton onClick={() => onSwitchToStep?.(5)}>
                次の手順へ
              </StepPrimaryButton>
            </div>
          </section>
        </>
      ) : null}

      {canFinalize && !isBusy ? (
        <>
          <StepDivider />
          <section>
            <StepSectionLabel>選択</StepSectionLabel>
            <ActionGrid columns={2}>
              <ActionChoiceCard
                icon={<UndoIcon color={palette.textLabel} />}
                title="前の手順に戻る"
                description="書類に問題が見つかった場合、仮締めを取り消します。ロックは解除され、仕訳データを再編集できるようになります。"
                action={
                  <StepSecondaryButton onClick={handleCancelPreClosing}>
                    取り消す
                  </StepSecondaryButton>
                }
              />
              <ActionChoiceCard
                icon={<CheckIcon color={palette.success} />}
                title="本締めを実行する"
                description="書類に問題がなかった場合、本締めを実行します。仕訳データは確定され、編集ができなくなります。"
                action={
                  <StepPrimaryButton onClick={handleFinalize} variant="success">
                    本締めを実行
                  </StepPrimaryButton>
                }
              />
            </ActionGrid>
          </section>
        </>
      ) : null}

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText error={screenError} />
        </div>
      ) : null}
    </>
  );
}

async function materializeAssistEntriesForFinalClosing(input: {
  fiscalPeriodId: string;
  periodStartDate: string;
  periodEndDate: string;
  assistState: Pick<
    ReturnType<typeof useOpenkkAssist>,
    "listFixedAssets" | "listOpeningCarryovers"
  >;
  entriesState: Pick<
    ReturnType<typeof useOpenkkEntries>,
    "listFiscalPeriodEntries" | "mergeFiscalPeriodEntries"
  >;
}) {
  const entries = buildClosingVirtualEntries({
    fiscalPeriodId: input.fiscalPeriodId,
    periodStartDate: input.periodStartDate,
    periodEndDate: input.periodEndDate,
    entries: input.entriesState.listFiscalPeriodEntries(input.fiscalPeriodId),
    assets: input.assistState.listFixedAssets(),
    carryovers: input.assistState.listOpeningCarryovers(input.fiscalPeriodId),
  });
  if (entries.length === 0) return;
  await input.entriesState.mergeFiscalPeriodEntries(
    input.fiscalPeriodId,
    entries,
  );
}
