"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  buildNextFiscalPeriodSuggestion,
  fiscalPeriodNameForEndDate,
  hasActiveFiscalPeriodOverlap,
  isOpeningCarryoverCandidate,
  validateFiscalPeriodDates,
} from "@rubydogjp/openkk-driver";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkBookFiles,
  useOpenkkCallout,
  useOpenkkConfig,
  useOpenkkEntries,
} from "../../bindings/index.js";
import { fontSize, fontWeight, palette } from "../../shared/design-tokens.js";
import { LockButton } from "../../shared/locked-action.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  FormDatePair,
  FormErrorText,
  FormStyles,
  FormTextInput,
} from "../../shared/form-fields.js";
import { CarryCheckboxItem, CheckboxStyles } from "../carry-checkbox.js";
import {
  StepCallout,
  StepFormRow,
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
  StepSpacer,
  StepUnavailableNotice,
} from "../step-ui.js";

type CarryOptions = {
  bs: boolean;
  transfer: boolean;
  fixed: boolean;
};

const CARRY_ITEMS: Array<{ id: keyof CarryOptions; label: string }> = [
  { id: "bs", label: "期末のBS → 翌期首のBS" },
  { id: "transfer", label: "期末の振替 → 翌期首の再振替" },
  { id: "fixed", label: "固定資産データ" },
];
const DEFAULT_CARRIES: CarryOptions = {
  bs: true,
  transfer: true,
  fixed: true,
};

export function NextFiscalPeriodBody({
  onSwitchToStep,
}: {
  onSwitchToStep: (no: number) => void;
}) {
  const config = useOpenkkConfig();
  const nextPeriodFooter = useOpenkkCallout("stepNextFiscalPeriodFooter");
  const appState = useOpenkkAppState();
  const bookFiles = useOpenkkBookFiles();
  const entriesState = useOpenkkEntries();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const currentFiscalPeriod = appState.currentFiscalPeriod;

  const suggested = useMemo(() => {
    if (currentFiscalPeriod == null)
      return { name: "", startDate: "", endDate: "" };
    return buildNextFiscalPeriodSuggestion(currentFiscalPeriod.endDate);
  }, [currentFiscalPeriod]);

  const [name, setName] = useState(suggested.name);
  const [startDate, setStartDate] = useState(suggested.startDate);
  const [endDate, setEndDate] = useState(suggested.endDate);
  const [nameEdited, setNameEdited] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingBackup, setIsSavingBackup] = useState(false);
  const workflowLock = useRef(new ExclusiveActionLock());
  const [carries, setCarries] = useState<CarryOptions>(DEFAULT_CARRIES);
  const [reversalEntryIds, setReversalEntryIds] = useState<string[]>([]);

  useEffect(() => {
    if (currentFiscalPeriod == null) return;
    setName(suggested.name);
    setStartDate(suggested.startDate);
    setEndDate(suggested.endDate);
    setNameEdited(false);
    setBackupMessage(null);
    setCarries(DEFAULT_CARRIES);
    setReversalEntryIds([]);
    setScreenError(null);
  }, [
    currentFiscalPeriod?.id,
    suggested.endDate,
    suggested.name,
    suggested.startDate,
  ]);

  useEffect(() => {
    if (nameEdited) return;
    const suggestedName = fiscalPeriodNameForEndDate(endDate);
    if (suggestedName != null) setName(suggestedName);
  }, [endDate, nameEdited]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const editingLocked = config.editingPolicy.locked;

  const canEnterPage = currentFiscalPeriod.phase === "post_closing";
  const reversalCandidates = entriesState
    .listFiscalPeriodEntries(currentFiscalPeriod.id)
    .filter(isOpeningCarryoverCandidate);
  const dateValidation = validateFiscalPeriodDates(startDate, endDate);
  const hasOverlap =
    dateValidation.ok &&
    hasActiveFiscalPeriodOverlap(
      { startDate, endDate },
      appState.fiscalPeriods,
      null,
    );
  const canCreateNext =
    canEnterPage &&
    currentFiscalPeriod.documentsReceivedCompleted &&
    !editingLocked &&
    !isCreating &&
    !isSavingBackup &&
    name.trim() !== "" &&
    startDate.trim() !== "" &&
    endDate.trim() !== "" &&
    dateValidation.ok &&
    !hasOverlap;

  const handleCreate = async () => {
    if (!canCreateNext) return;
    const release = workflowLock.current.tryAcquire();
    if (release == null) return;
    const authOperationVersion = appState.captureAuthOperationVersion();
    setIsCreating(true);
    let createdId: string | null = null;
    try {
      createdId = await appState.createNextFiscalPeriod({
        sourceFiscalPeriodId: currentFiscalPeriod.id,
        name,
        startDate,
        endDate,
        carryBalances: carries.bs,
        reversalEntryIds: carries.transfer ? reversalEntryIds : [],
        carryFixedAssets: carries.fixed,
      });
      appState.assertAuthOperationCurrent(authOperationVersion);
      setScreenError(null);
      appState.selectFiscalPeriod(createdId);
    } catch (error) {
      if (
        createdId != null &&
        appState.isAuthOperationCurrent(authOperationVersion)
      ) {
        appState.selectFiscalPeriod(createdId);
      }
      if (!appState.isAuthOperationCurrent(authOperationVersion)) return;
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "次の期間の作成に失敗しました",
          fallbackDeveloperMessage:
            "steps/next-fiscal-period: createFiscalPeriod failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsCreating(false);
      release();
    }
  };

  const toggleCarry = (id: keyof CarryOptions) =>
    setCarries((current) => ({ ...current, [id]: !current[id] }));

  const handleBackup = async () => {
    if (bookFiles == null) return;
    const release = workflowLock.current.tryAcquire();
    if (release == null) return;
    setIsSavingBackup(true);
    try {
      const result = await bookFiles.save(currentFiscalPeriod.id);
      setBackupMessage(result === "saved" ? "ファイルに保存しました" : null);
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "バックアップをダウンロードできませんでした",
          fallbackDeveloperMessage:
            "steps/next-fiscal-period: book backup failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsSavingBackup(false);
      release();
    }
  };

  return (
    <>
      <FormStyles />
      <CheckboxStyles />

      {!canEnterPage ? (
        <StepUnavailableNotice editingPolicy={config.editingPolicy} />
      ) : null}

      <section>
        <StepSectionLabel>新しい期間</StepSectionLabel>
        <StepMetaCard>
          <StepFormRow
            label="名称"
            control={
              <FormTextInput
                value={name}
                onChange={(value) => {
                  if (!canEnterPage) return;
                  setNameEdited(true);
                  setName(value);
                }}
                readOnly={!canEnterPage}
                width={280}
                placeholder="例: 2027年分"
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
                  onChangeStart={(value) => {
                    if (canEnterPage) setStartDate(value);
                  }}
                  onChangeEnd={(value) => {
                    if (canEnterPage) setEndDate(value);
                  }}
                  readOnly={!canEnterPage}
                />
                {canEnterPage && !dateValidation.ok ? (
                  <FormErrorText>{dateValidation.message}</FormErrorText>
                ) : canEnterPage && hasOverlap ? (
                  <FormErrorText>
                    既存の有効な会計期間と日付が重複しています。
                  </FormErrorText>
                ) : null}
              </>
            }
            hint={null}
          />
        </StepMetaCard>
      </section>

      <StepSpacer height={null} />

      <section>
        <StepSectionLabel>引き継ぎ</StepSectionLabel>
        <StepMetaCard>
          <StepMetaRow
            label="引き継ぎ元"
            value={currentFiscalPeriod.name}
            divider={false}
          />
          <StepFormRow
            label="引き継ぎ項目"
            divider
            control={
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {CARRY_ITEMS.map((item) => (
                  <CarryCheckboxItem
                    key={item.id}
                    inputId={`carry-${item.id}`}
                    checked={carries[item.id]}
                    onChange={() => {
                      if (canEnterPage) toggleCarry(item.id);
                    }}
                    label={item.label}
                    disabled={!canEnterPage}
                  />
                ))}
              </div>
            }
            hint="引き継いだ期首のBSなどは、次の期間の仮締めまでいつでも編集・引き継ぎ直しができます。"
          />
        </StepMetaCard>
        {canEnterPage && carries.transfer ? (
          <StepMetaCard>
            <StepFormRow
              label="再振替する仕訳"
              divider={false}
              control={
                <div>
                  {reversalCandidates.map((entry) => (
                    <CarryCheckboxItem
                      key={entry.id}
                      inputId={`reversal-${entry.id}`}
                      checked={reversalEntryIds.includes(entry.id)}
                      onChange={() =>
                        setReversalEntryIds((ids) =>
                          ids.includes(entry.id)
                            ? ids.filter((id) => id !== entry.id)
                            : [...ids, entry.id],
                        )
                      }
                      label={`${entry.date} ${entry.description}（${entry.lines
                        .map(
                          (line) =>
                            `${line.side === "debit" ? "借" : "貸"}: ${line.accountName} ${line.amount}円`,
                        )
                        .join(" / ")}）`}
                      disabled={editingLocked || isCreating || isSavingBackup}
                    />
                  ))}
                  {reversalCandidates.length === 0
                    ? "候補の仕訳はありません"
                    : null}
                </div>
              }
              hint="期末に残る未払・前払など、翌期首に戻す仕訳を選んでください。支払済み・精算済みの仕訳は選択しません。"
            />
          </StepMetaCard>
        ) : null}
        {canEnterPage ? (
          <>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              {editingLocked ? (
                <LockButton label="次期を作成" />
              ) : (
                <StepPrimaryButton
                  onClick={() => {
                    if (canCreateNext) void handleCreate();
                  }}
                  disabled={!canCreateNext}
                  variant="success"
                  icon={null}
                >
                  {isCreating ? "作成中" : "次期を作成"}
                </StepPrimaryButton>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <StepSecondaryButton onClick={() => onSwitchToStep(5)}>
              前の手順へ
            </StepSecondaryButton>
          </div>
        )}
      </section>

      {nextPeriodFooter != null ? (
        <>
          <StepSpacer height={null} />
          <StepCallout tone="info">{nextPeriodFooter}</StepCallout>
        </>
      ) : null}

      <StepSpacer height={44} />

      {bookFiles != null ? (
        <section>
          <StepSectionLabel>バックアップ</StepSectionLabel>
          <StepMetaCard>
            <StepMetaRow
              label="ファイル"
              value={`この会計期間のデータを、そのままファイル (${bookFiles.fileNameOf(currentFiscalPeriod.name)}) としてダウンロードします。${bookFiles.saveTracking != null ? "左上の「保存」と同じファイルで、" : ""}期間の選択の「ファイル」から取り込めます。`}
              divider={false}
            />
          </StepMetaCard>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            {backupMessage != null ? (
              <span
                role="status"
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.semibold,
                  color: palette.success,
                }}
              >
                {backupMessage}
              </span>
            ) : null}
            <StepPrimaryButton
              onClick={handleBackup}
              disabled={isSavingBackup || isCreating}
              variant="success"
              icon={null}
            >
              バックアップをダウンロード
            </StepPrimaryButton>
          </div>
        </section>
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
