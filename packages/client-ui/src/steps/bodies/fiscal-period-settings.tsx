"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  hasActiveFiscalPeriodOverlap,
  resolveEditingPolicy,
  validateFiscalPeriodDates,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { palette } from "../../shared/design-tokens.js";
import { useConfirmDialog } from "../../shared/confirm-dialog.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  FormDatePair,
  FormErrorText,
  FormReadOnlyValue,
  FormStyles,
  FormTextInput,
} from "../../shared/form-fields.js";
import {
  PlayIcon,
  StepCallout,
  StepFormRow,
  StepMetaCard,
  StepPrimaryButton,
} from "../step-ui.js";

export function FiscalPeriodSettingsBody({
  onSwitchToStep,
}: {
  onSwitchToStep: ((stepNo: number) => void) | null;
}) {
  const appState = useOpenkkAppState();
  const config = useOpenkkConfig();
  const editingLocked = resolveEditingPolicy(config).locked;
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
  const [isStarting, setIsStarting] = useState(false);
  const startLock = useRef(new ExclusiveActionLock());

  useEffect(() => {
    setName(currentFiscalPeriod?.name ?? "");
    setStartDate(currentFiscalPeriod?.startDate ?? "");
    setEndDate(currentFiscalPeriod?.endDate ?? "");
    setScreenError(null);
  }, [currentFiscalPeriod?.id]);

  const dateValidation = useMemo(
    () => validateFiscalPeriodDates(startDate, endDate),
    [endDate, startDate],
  );
  const hasOverlap =
    dateValidation.ok &&
    currentFiscalPeriod != null &&
    hasActiveFiscalPeriodOverlap(
      { startDate, endDate },
      appState.fiscalPeriods,
      currentFiscalPeriod.id,
    );
  const canSave = useMemo(() => {
    return (
      currentFiscalPeriod != null &&
      !currentFiscalPeriod.settingsCompleted &&
      !editingLocked &&
      name.trim() !== "" &&
      startDate.trim() !== "" &&
      endDate.trim() !== "" &&
      dateValidation.ok &&
      !hasOverlap &&
      !isStarting
    );
  }, [
    currentFiscalPeriod,
    dateValidation.ok,
    editingLocked,
    endDate,
    hasOverlap,
    isStarting,
    name,
    startDate,
  ]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const isPeriodLocked =
    currentFiscalPeriod.phase === "post_closing" ||
    currentFiscalPeriod.phase === "pre_closing";
  const isStarted = currentFiscalPeriod.settingsCompleted;
  const isReadOnly = isStarted || isPeriodLocked || editingLocked;
  const lockMessage = editingLocked
    ? (resolveEditingPolicy(config).lockedNotice ??
      "この環境ではデータの編集がロックされています。")
    : isPeriodLocked
      ? "仮締め以降のため変更できません。"
      : isStarted
        ? "開始済みのため変更できません。"
        : null;

  const handleStart = async () => {
    if (!canSave) return;
    const release = startLock.current.tryAcquire();
    if (release == null) return;
    const confirmed = await confirm({
      tone: "success",
      title: "期間を開始",
      body: [
        "開始すると、期間や一部のデータは変更できなくなります。",
        "内容に間違いがないことを確認した上で開始してください。",
      ],
      confirmLabel: "開始する",
      cancelLabel: null,
    });
    if (!confirmed) {
      release();
      return;
    }
    setIsStarting(true);
    try {
      const updated = await appState.updateFiscalPeriod(
        currentFiscalPeriod.id,
        {
          name,
          startDate,
          endDate,
          settingsCompleted: true,
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
          statusCode: null,
        }),
      );
    } finally {
      setIsStarting(false);
      release();
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
          hint={null}
          divider={false}
        />
        <StepFormRow
          label="期間"
          divider
          control={
            <>
              <FormDatePair
                start={startDate}
                end={endDate}
                onChangeStart={setStartDate}
                onChangeEnd={setEndDate}
                readOnly={isReadOnly}
              />
              {!dateValidation.ok && !isReadOnly ? (
                <FormErrorText>{dateValidation.message}</FormErrorText>
              ) : hasOverlap && !isReadOnly ? (
                <FormErrorText>
                  既存の有効な会計期間と日付が重複しています。
                </FormErrorText>
              ) : null}
            </>
          }
          hint={
            lockMessage == null
              ? "開始するまでの間、名称と期間を変更できます。"
              : null
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
          <StepPrimaryButton
            onClick={() => onSwitchToStep?.(2)}
            disabled={false}
            variant={null}
            icon={null}
          >
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
            {isStarting ? "開始中…" : "開始する"}
          </StepPrimaryButton>
        </div>
      )}

      {screenError != null ? (
        <div style={{ marginTop: 16 }}>
          <AppErrorText error={screenError} style={null} fallbackUserMessage={null} />
        </div>
      ) : null}
    </>
  );
}
