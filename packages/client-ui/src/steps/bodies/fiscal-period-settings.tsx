"use client";

import { useMemo, useState } from "react";

import { AppError } from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
import { useOpenkkAppState } from "@rubydogjp/openkk-client-usecases";
import { palette } from "../../shared/design-tokens";
import { useConfirmDialog } from "../../shared/confirm-dialog";
import {
  FormDatePair,
  FormReadOnlyValue,
  FormStyles,
  FormTextInput,
} from "../../shared/form-fields";
import {
  PlayIcon,
  StepCallout,
  StepFormRow,
  StepMetaCard,
  StepPrimaryButton,
} from "../step-ui";

export function FiscalPeriodSettingsBody({
  onSwitchToStep,
}: {
  onSwitchToStep?: (stepNo: number) => void;
}) {
  const appState = useOpenkkAppState();
  const { confirm, dialog } = useConfirmDialog();
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  const [name, setName] = useState(currentFiscalPeriod?.name ?? "");
  const [startDate, setStartDate] = useState(
    currentFiscalPeriod?.startDate ?? "",
  );
  const [endDate, setEndDate] = useState(currentFiscalPeriod?.endDate ?? "");
  const [screenError, setScreenError] = useState<unknown>(null);

  const canSave = useMemo(() => {
    return (
      currentFiscalPeriod != null &&
      !currentFiscalPeriod.settingsCompleted &&
      name.trim() !== "" &&
      startDate.trim() !== "" &&
      endDate.trim() !== ""
    );
  }, [currentFiscalPeriod, endDate, name, startDate]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const isPeriodLocked =
    currentFiscalPeriod.stage === "post_closing" ||
    currentFiscalPeriod.provisionalClosingCompleted === true;
  const isStarted = currentFiscalPeriod.settingsCompleted;
  const isReadOnly = isStarted || isPeriodLocked;
  const lockMessage = isPeriodLocked
    ? "仮締め以降のため変更できません。"
    : isStarted
      ? "開始済みのため変更できません。"
      : null;

  const handleStart = async () => {
    const confirmed = await confirm({
      tone: "success",
      title: "期間を開始",
      body: [
        "開始すると、期間や一部のデータは変更できなくなります。",
        "内容に間違いがないことを確認した上で開始してください。",
      ],
      confirmLabel: "開始する",
    });
    if (!confirmed) return;
    try {
      const updated = await appState.updateFiscalPeriod(
        currentFiscalPeriod.id,
        {
          name,
          startDate,
          endDate,
          settingsCompleted: true,
          stage: "journalizing",
        },
      );
      if (!updated) return;
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "期間の更新に失敗しました",
          fallbackDeveloperMessage:
            "steps/fiscal-period-settings: updateFiscalPeriod failed",
        }),
      );
    }
  };

  return (
    <>
      <FormStyles />
      {dialog}
      {lockMessage != null ? (
        <div style={{ marginBottom: 16 }}>
          <StepCallout tone="info">{lockMessage}</StepCallout>
        </div>
      ) : null}

      <StepMetaCard>
        <StepFormRow
          label="期間の名称"
          control={
            <FormTextInput
              value={name}
              onChange={setName}
              readOnly={isReadOnly}
              width={280}
              placeholder="例: 2026年分"
            />
          }
        />
        <StepFormRow
          label="期間"
          divider
          control={
            <FormDatePair
              start={startDate}
              end={endDate}
              onChangeStart={setStartDate}
              onChangeEnd={setEndDate}
              readOnly={isReadOnly}
            />
          }
          hint={
            lockMessage == null
              ? "開始するまでの間、名称と期間を変更できます。"
              : undefined
          }
        />
        <StepFormRow
          label="消費税の扱い"
          divider
          control={<FormReadOnlyValue width={200}>税込経理</FormReadOnlyValue>}
          hint="現在は「税込経理」のみ対応しています。"
        />
      </StepMetaCard>

      {isReadOnly ? (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <StepPrimaryButton onClick={() => onSwitchToStep?.(2)}>
            次の手順へ
          </StepPrimaryButton>
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <StepPrimaryButton
            onClick={handleStart}
            disabled={!canSave}
            variant="success"
            icon={<PlayIcon color={palette.surface} />}
          >
            開始する
          </StepPrimaryButton>
        </div>
      )}

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText error={screenError} />
        </div>
      ) : null}
    </>
  );
}
