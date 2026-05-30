"use client";

import { useState } from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
import { useOpenkkAppState } from "@rubydogjp/openkk-client-usecases";
import { useOpenkkEntries } from "@rubydogjp/openkk-client-usecases";
import { usePrintDocument } from "@rubydogjp/openkk-client-usecases";
import { palette } from "../../shared/design-tokens";
import { DocumentFileList } from "../../shared/document-file-tile";
import { buildJournalDocument } from "@rubydogjp/openkk-client-domain";
import { buildGeneralLedgerDocument } from "@rubydogjp/openkk-client-domain";
import { buildFinancialStatementsDocument } from "@rubydogjp/openkk-client-domain";
import { computeFsAggregate } from "@rubydogjp/openkk-client-domain";
import {
  StepCallout,
  StepDivider,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
} from "../step-ui";

export function DocumentReceiveBody({
  onSwitchToStep,
}: {
  onSwitchToStep?: (no: number) => void;
} = {}) {
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const printDocument = usePrintDocument();
  const [screenError, setScreenError] = useState<unknown>(null);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const canComplete = currentFiscalPeriod.stage === "post_closing";
  const isDone = currentFiscalPeriod.documentsReceivedCompleted;

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

  const handleComplete = async () => {
    try {
      const updated = await appState.updateFiscalPeriod(
        currentFiscalPeriod.id,
        { documentsReceivedCompleted: true },
      );
      if (!updated) return;
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "書類受領の更新に失敗しました",
          fallbackDeveloperMessage:
            "steps/document-receive: updateFiscalPeriod failed",
        }),
      );
    }
  };

  return (
    <>

      {!canComplete ? (
        <>
          <StepCallout tone="warning">
            この手順はまだ進められません。
          </StepCallout>
          <StepDivider />
        </>
      ) : null}

      <section>
        <StepSectionLabel>受領する書類</StepSectionLabel>
        <DocumentFileList
          items={[
            {
              label: "仕訳帳.pdf",
              active: canComplete,
              onClick: canComplete ? printJournal : undefined,
            },
            {
              label: "総勘定元帳.pdf",
              active: canComplete,
              onClick: canComplete ? printGeneralLedger : undefined,
            },
            {
              label: "財務諸表.pdf",
              active: canComplete,
              onClick: canComplete ? printFinancialStatements : undefined,
            },
          ]}
        />
        {!canComplete ? (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <StepSecondaryButton onClick={() => onSwitchToStep?.(4)}>
              前の手順へ
            </StepSecondaryButton>
          </div>
        ) : null}
        {canComplete ? (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            {isDone ? (
              <StepPrimaryButton onClick={() => onSwitchToStep?.(6)}>
                次の手順へ
              </StepPrimaryButton>
            ) : (

              <StepPrimaryButton onClick={handleComplete} variant="success">
                全て受け取りました
              </StepPrimaryButton>
            )}
          </div>
        ) : null}
      </section>

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText error={screenError} />
        </div>
      ) : null}
    </>
  );
}
