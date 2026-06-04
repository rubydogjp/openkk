"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AppError,
  buildVirtualFixedAssetRows,
  buildVirtualOpeningCarryoverRows,
  materializeVirtualEntryRows,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkClosing,
  useOpenkkEntries,
  useOpenkkConfig,
  usePrintDocument,
} from "@rubydogjp/openkk-client-usecases";
import { formatDateButtonLabel } from "../../shared/date-picker";
import { palette } from "../../shared/design-tokens";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import { PlBsDiagramSection } from "../../shared/pl-bs-diagram";
import { DocumentFileList } from "../../shared/document-file-tile";
import { buildJournalDocument } from "@rubydogjp/openkk-client-domain";
import { buildGeneralLedgerDocument } from "@rubydogjp/openkk-client-domain";
import { buildFinancialStatementsDocument } from "@rubydogjp/openkk-client-domain";
import { computeFsAggregate } from "@rubydogjp/openkk-client-domain";
import { ClosingExplainerAnimation } from "../closing-animation";
import {
  computeBSSummary,
  computeFinancialSummary,
  summarizeOpeningBalances,
} from "@rubydogjp/openkk-client-domain";
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
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const closingApi = useOpenkkClosing();
  const printDocument = usePrintDocument();
  const { confirm, dialog } = useConfirmDialog();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isProvisionalClosedRemote, setIsProvisionalClosedRemote] =
    useState(false);
  const [showRunningAnimation, setShowRunningAnimation] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  useEffect(() => {
    return () => onBusyChange?.(false);
  }, [onBusyChange]);

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

  const financialSummary = useMemo(() => {
    if (appState.currentFiscalPeriodId == null) return null;
    return computeFinancialSummary(
      entriesState.listFiscalPeriodEntries(appState.currentFiscalPeriodId),
    );
  }, [appState.currentFiscalPeriodId, entriesState]);

  const bsSummary = useMemo(() => {
    if (appState.currentFiscalPeriodId == null || financialSummary == null)
      return null;
    return computeBSSummary(
      entriesState.listFiscalPeriodEntries(appState.currentFiscalPeriodId),
      summarizeOpeningBalances(
        currentFiscalPeriod?.opening?.openingBalanceLines ?? [],
      ),
      financialSummary.profit,
    );
  }, [
    appState.currentFiscalPeriodId,
    currentFiscalPeriod?.opening,
    entriesState,
    financialSummary,
  ]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const isClosed = currentFiscalPeriod.stage === "post_closing";
  const isProvisionalClosed = config.isMockMode
    ? currentFiscalPeriod.provisionalClosingCompleted
    : isProvisionalClosedRemote;
  const canFinalize = isProvisionalClosed && !isClosed;
  const canEnterPage = isProvisionalClosed || isClosed;
  const isBusy = showRunningAnimation;

  const handleCancelProvisional = async () => {
    const confirmed = await confirm({

      tone: "danger",
      title: "仮締めを取り消す",
      body: ["1つ前の手順に戻り、ロックを解除して再び編集できるようにします。"],
      confirmLabel: "取り消す",
    });
    if (!confirmed) return;
    try {
      if (config.isMockMode) {
        const updated = await appState.updateFiscalPeriod(
          currentFiscalPeriod.id,
          { provisionalClosingCompleted: false },
        );
        if (!updated) return;
      } else if (appState.currentFiscalPeriodId != null) {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.cancelProvisional(appState.currentFiscalPeriodId, year);
        setIsProvisionalClosedRemote(false);
      }
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "仮締めの取り消しに失敗しました",
          fallbackDeveloperMessage:
            "steps/closing: cancel provisional close failed",
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
        periodEndDate: currentFiscalPeriod.endDate,
        assistState,
        entriesState,
      });
      if (config.isMockMode) {
        const updated = await appState.updateFiscalPeriod(
          currentFiscalPeriod.id,
          {
            stage: "post_closing",
            provisionalClosingCompleted: true,
          },
        );
        if (!updated) {
          setShowRunningAnimation(false);
          onBusyChange?.(false);
          return;
        }
      } else if (appState.currentFiscalPeriodId != null) {
        const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
        await closingApi.runFinal(appState.currentFiscalPeriodId, year);
        await appState.updateFiscalPeriod(currentFiscalPeriod.id, {
          stage: "post_closing",
          provisionalClosingCompleted: true,
        });
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

  function printJournal() {
    if (!appState.currentFiscalPeriodId) return;
    const entries = entriesState.listFiscalPeriodEntries(
      appState.currentFiscalPeriodId,
    );
    printDocument(buildJournalDocument(currentFiscalPeriod!.name, entries));
  }

  function printGeneralLedger() {
    if (!appState.currentFiscalPeriodId) return;
    const entries = entriesState.listFiscalPeriodEntries(
      appState.currentFiscalPeriodId,
    );
    const openingBalanceLines =
      currentFiscalPeriod!.opening?.openingBalanceLines ?? [];
    printDocument(
      buildGeneralLedgerDocument(
        currentFiscalPeriod!.name,
        entries,
        openingBalanceLines,
      ),
    );
  }

  function printFinancialStatements() {
    if (!appState.currentFiscalPeriodId) return;
    const entries = entriesState.listFiscalPeriodEntries(
      appState.currentFiscalPeriodId,
    );
    const openingBalanceLines =
      currentFiscalPeriod!.opening?.openingBalanceLines ?? [];
    const { amounts, bsRows } = computeFsAggregate({
      entries,
      openingBalanceLines,
    });
    printDocument(
      buildFinancialStatementsDocument({
        fpName: currentFiscalPeriod!.name,
        amounts,
        bsRows,
      }),
    );
  }

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

      {isClosed && !showRunningAnimation && financialSummary != null ? (
        <>
          <StepDivider />
          <section>
            <StepSectionLabel>財務諸表の概要</StepSectionLabel>

            <PlBsDiagramSection
              pl={financialSummary}
              bs={bsSummary ?? undefined}
            />
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
                  <StepSecondaryButton onClick={handleCancelProvisional}>
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
  periodEndDate: string;
  assistState: Pick<
    ReturnType<typeof useOpenkkAssist>,
    "listFixedAssets" | "listOpeningCarryovers"
  >;
  entriesState: Pick<ReturnType<typeof useOpenkkEntries>, "mergeFiscalPeriodEntries">;
}) {
  const carryoverEntries = input.assistState
    .listOpeningCarryovers(input.fiscalPeriodId)
    .flatMap((record) =>
      materializeVirtualEntryRows({
        fiscalPeriodId: input.fiscalPeriodId,
        yearMonth: record.date.slice(0, 7),
        rows: buildVirtualOpeningCarryoverRows({
          fiscalPeriodId: input.fiscalPeriodId,
          records: [record],
          yearMonth: record.date.slice(0, 7),
        }),
      }),
    );

  const assets = input.assistState.listFixedAssets();
  const fixedAssetMonths = new Set<string>();
  if (input.periodEndDate.length >= 7) {
    fixedAssetMonths.add(input.periodEndDate.slice(0, 7));
  }
  for (const asset of assets) {
    if (asset.disposalDate != null && asset.disposalDate.length >= 7) {
      fixedAssetMonths.add(asset.disposalDate.slice(0, 7));
    }
  }
  const fixedAssetEntries = Array.from(fixedAssetMonths).flatMap((yearMonth) =>
    materializeVirtualEntryRows({
      fiscalPeriodId: input.fiscalPeriodId,
      yearMonth,
      rows: buildVirtualFixedAssetRows({
        fiscalPeriodId: input.fiscalPeriodId,
        assets,
        periodEndDate: input.periodEndDate,
        yearMonth,
      }),
    }),
  );

  const entries = [...carryoverEntries, ...fixedAssetEntries];
  if (entries.length === 0) return;
  await input.entriesState.mergeFiscalPeriodEntries(input.fiscalPeriodId, entries);
}
