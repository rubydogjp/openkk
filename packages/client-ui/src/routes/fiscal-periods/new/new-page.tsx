"use client";

import { useRouter } from "next/navigation.js";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  hasActiveFiscalPeriodOverlap,
  resolveEditingPolicy,
  resolveFiscalPeriodPolicy,
  validateFiscalPeriodDates,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAppState,
  useOpenkkConfig,
  useOpenkkToday,
} from "@rubydogjp/openkk-client-usecases";
import { AppErrorText } from "../../../shared/app-error-text.js";
import { LockButton } from "../../../shared/locked-action.js";
import { ExclusiveActionLock } from "../../../shared/exclusive-action-lock.js";
import {
  fontSize,
  fontWeight,
  palette,
  sizes,
  spacing,
  typography,
} from "../../../shared/design-tokens.js";
import {
  FormDatePair,
  FormErrorText,
  FormPrimaryButton,
  FormSecondaryButton,
  FormStyles,
  FormTextInput,
} from "../../../shared/form-fields.js";
import { StepFormRow, StepMetaCard } from "../../../steps/step-ui.js";

export function CreateFiscalPeriodPage() {
  const router = useRouter();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const today = useOpenkkToday();
  const initialYear = today.getFullYear();
  const [name, setName] = useState(`${initialYear}年分`);
  const [startDate, setStartDate] = useState(`${initialYear}-01-01`);
  const [endDate, setEndDate] = useState(`${initialYear}-12-31`);
  const [nameEdited, setNameEdited] = useState(false);
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isCreating, setIsCreating] = useState(false);
  const createLock = useRef(new ExclusiveActionLock());
  const editingLocked = resolveEditingPolicy(openkkConfig.editingPolicy).locked;

  useEffect(() => {
    if (nameEdited) return;
    const yearText = endDate.slice(0, 4);
    if (yearText.length === 4) {
      setName(`${yearText}年分`);
    }
  }, [endDate, nameEdited]);

  const canCreate = useMemo(() => {
    return (
      name.trim() !== "" && startDate.trim() !== "" && endDate.trim() !== ""
    );
  }, [endDate, name, startDate]);
  const dateValidation = useMemo(
    () => validateFiscalPeriodDates(startDate, endDate),
    [endDate, startDate],
  );
  const hasOverlap =
    dateValidation.ok &&
    hasActiveFiscalPeriodOverlap(
      { startDate, endDate },
      appState.fiscalPeriods,
      null,
    );
  const maxActivePeriods =
    resolveFiscalPeriodPolicy(openkkConfig.fiscalPeriodPolicy).maxActivePeriods;
  const atPeriodLimit =
    maxActivePeriods != null &&
    appState.fiscalPeriods.filter((period) => period.archiveStatus === "active")
      .length >= maxActivePeriods;
  const canSubmit =
    canCreate &&
    dateValidation.ok &&
    !hasOverlap &&
    !atPeriodLimit &&
    !editingLocked &&
    !isCreating;

  const handleCreate = async () => {
    if (!canSubmit) return;
    const release = createLock.current.tryAcquire();
    if (release == null) return;
    setIsCreating(true);
    try {
      const createdId = await appState.createFiscalPeriod({
        name,
        startDate,
        endDate,
      });
      if (createdId == null) return;
      setScreenError(null);
      router.push("/steps");
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "期間の作成に失敗しました",
          fallbackDeveloperMessage:
            "fiscal-periods/new: createFiscalPeriod failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsCreating(false);
      release();
    }
  };

  return (
    <section style={{ padding: "32px 24px 96px" }}>
      <div style={{ maxWidth: sizes.content.formMaxWidth, margin: "0 auto" }}>
        <FormStyles />
        <header style={{ marginBottom: 24 }}>
          <h1
            style={{
              margin: 0,
              fontSize: typography.dialogTitle.fontSize,
              fontWeight: fontWeight.bold,
              color: palette.text,
              letterSpacing: "-0.01em",
            }}
          >
            新しい期間
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: fontSize.base,
              lineHeight: 1.7,
              color: palette.textSoft,
            }}
          >
            名称と期間を入力して、期間を新しく作成します。
          </p>
        </header>

        <StepMetaCard>
          <StepFormRow
            label="期間の名称"
            control={
              <FormTextInput
                value={name}
                readOnly={atPeriodLimit || editingLocked}
                onChange={(value) => {
                  setNameEdited(true);
                  setName(value);
                }}
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
                  readOnly={atPeriodLimit || editingLocked}
                />
                {!dateValidation.ok && !atPeriodLimit && !editingLocked ? (
                  <FormErrorText>{dateValidation.message}</FormErrorText>
                ) : hasOverlap && !atPeriodLimit && !editingLocked ? (
                  <FormErrorText>
                    既存の有効な会計期間と日付が重複しています。
                  </FormErrorText>
                ) : null}
              </>
            }
            hint={
              atPeriodLimit
                ? "有効な会計期間の上限に達しているため、新しい期間は作成できません。"
                : editingLocked
                  ? "この環境ではデータの編集がロックされています。"
                : null
            }
          />
        </StepMetaCard>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "flex-end",
            gap: spacing.s10,
          }}
        >
          <FormSecondaryButton
            onClick={() => {
              if (!createLock.current.isLocked) router.push("/steps");
            }}
            disabled={isCreating}
            type={null}
          >
            キャンセル
          </FormSecondaryButton>
          {atPeriodLimit || editingLocked ? (
            <LockButton label="作成する" style={null} />
          ) : (
            <FormPrimaryButton
              onClick={handleCreate}
              disabled={!canSubmit}
              type={null}
              variant={null}
              icon={null}
            >
              {isCreating ? "作成中…" : "作成する"}
            </FormPrimaryButton>
          )}
        </div>

        {screenError != null ? (
          <div style={{ marginTop: 16 }}>
            <AppErrorText error={screenError} style={null} fallbackUserMessage={null} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
