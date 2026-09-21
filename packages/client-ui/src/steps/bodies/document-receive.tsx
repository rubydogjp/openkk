"use client";

import { useRef, useState } from "react";

import {
  AppError,
  resolveEditingPolicy,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { palette } from "../../shared/design-tokens.js";
import { DocumentFileList } from "../../shared/document-file-tile.js";
import { LockButton } from "../../shared/lock-icon.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import { useStepDocumentPrinters } from "../use-step-document-printers.js";
import {
  StepCallout,
  StepDivider,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
} from "../step-ui.js";

export function DocumentReceiveBody({
  onSwitchToStep,
}: {
  onSwitchToStep: ((no: number) => void) | null;
}) {
  const appState = useOpenkkAppState();
  const config = useOpenkkConfig();
  const editingLocked = resolveEditingPolicy(config.editingPolicy).locked;
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const completeLock = useRef(new ExclusiveActionLock());
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const { printJournal, printGeneralLedger, printFinancialStatements } =
    useStepDocumentPrinters(currentFiscalPeriod ?? null);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const canComplete = currentFiscalPeriod.phase === "post_closing";
  const isDone = currentFiscalPeriod.documentsReceivedCompleted;

  const handleComplete = async () => {
    if (!canComplete || isDone || editingLocked) return;
    const release = completeLock.current.tryAcquire();
    if (release == null) return;
    setIsCompleting(true);
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
          statusCode: null,
        }),
      );
    } finally {
      setIsCompleting(false);
      release();
    }
  };

  return (
    <>
      {!canComplete ? (
        <>
          <StepCallout tone="warning">
            この手順はまだ進められません。
          </StepCallout>
          <StepDivider marginY={null} />
        </>
      ) : null}

      <section>
        <StepSectionLabel>受領する書類</StepSectionLabel>
        <DocumentFileList
          actionLabel={null}
          items={[
            {
              label: "仕訳帳.pdf",
              active: canComplete,
              onClick: canComplete ? printJournal : null,
              description: null,
            },
            {
              label: "総勘定元帳.pdf",
              active: canComplete,
              onClick: canComplete ? printGeneralLedger : null,
              description: null,
            },
            {
              label: "財務諸表.pdf",
              active: canComplete,
              onClick: canComplete ? printFinancialStatements : null,
              description: null,
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
            <StepSecondaryButton
              onClick={() => onSwitchToStep?.(4)}
              disabled={false}
            >
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
              <StepPrimaryButton
                onClick={() => onSwitchToStep?.(6)}
                disabled={false}
                variant={null}
                icon={null}
              >
                次の手順へ
              </StepPrimaryButton>
            ) : editingLocked ? (
              <LockButton label="全て受け取りました" style={null} />
            ) : (
              <StepPrimaryButton
                onClick={handleComplete}
                disabled={isCompleting}
                variant="success"
                icon={null}
              >
                {isCompleting ? "更新中…" : "全て受け取りました"}
              </StepPrimaryButton>
            )}
          </div>
        ) : null}
      </section>

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText error={screenError} style={null} fallbackUserMessage={null} />
        </div>
      ) : null}
    </>
  );
}
