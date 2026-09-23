"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchivePayload,
  buildNextFiscalPeriodSuggestion,
  createFiscalPeriodArchiveZip,
  hasActiveFiscalPeriodOverlap,
  isOpeningCarryoverCandidate,
  validateFiscalPeriodDates,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useBackendApi,
  useOpenkkAppState,
  useOpenkkCallout,
  useOpenkkConfig,
  useOpenkkEntries,
} from "@rubydogjp/openkk-client-usecases";
import {
  fontSize,
  fontWeight,
  palette,
  rings,
} from "../../shared/design-tokens.js";
import { LockButton } from "../../shared/locked-action.js";
import { downloadBytes } from "../../shared/download.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  FormDatePair,
  FormErrorText,
  FormStyles,
  FormTextInput,
} from "../../shared/form-fields.js";
import {
  StepDivider,
  StepFormRow,
  StepCallout,
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
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
  onSwitchToStep: ((no: number) => void) | null;
}) {
  const config = useOpenkkConfig();
  const nextPeriodFooter = useOpenkkCallout("stepNextFiscalPeriodFooter");
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

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
  const [isArchiving, setIsArchiving] = useState(false);
  const workflowLock = useRef(new ExclusiveActionLock());
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [carries, setCarries] = useState<CarryOptions>(DEFAULT_CARRIES);
  const [reversalEntryIds, setReversalEntryIds] = useState<string[]>([]);

  useEffect(() => {
    if (currentFiscalPeriod == null) return;
    setName(suggested.name);
    setStartDate(suggested.startDate);
    setEndDate(suggested.endDate);
    setNameEdited(false);
    setArchiveMessage(null);
    setPendingAdvance(false);
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
    const yearText = endDate.slice(0, 4);
    if (yearText.length === 4) setName(`${yearText}年分`);
  }, [endDate, nameEdited]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }

  const policy = config.fiscalPeriodPolicy;
  const editingLocked = config.editingPolicy.locked;
  const requiresArchiveBeforeNext =
    policy.maxActivePeriods != null && policy.maxActivePeriods <= 1;
  const isEphemeral = policy.archiveRetention === "ephemeral";
  const currentArchived = currentFiscalPeriod.archiveStatus !== "active";
  const activePeriodCount = appState.fiscalPeriods.filter(
    (period) => period.archiveStatus === "active",
  ).length;
  const atActivePeriodLimit =
    policy.maxActivePeriods != null &&
    activePeriodCount >= policy.maxActivePeriods;

  const canEnterPage = currentFiscalPeriod.phase === "post_closing";
  const isNotStarted = !canEnterPage;
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
    !isArchiving &&
    name.trim() !== "" &&
    startDate.trim() !== "" &&
    endDate.trim() !== "" &&
    dateValidation.ok &&
    !hasOverlap &&
    !atActivePeriodLimit &&
    (!requiresArchiveBeforeNext || currentArchived);
  const canArchive =
    canEnterPage &&
    currentFiscalPeriod.documentsReceivedCompleted &&
    currentFiscalPeriod.archiveStatus === "active" &&
    !editingLocked &&
    !isArchiving &&
    !isCreating;

  const ephemeralWarning = {
    title: policy.ephemeralArchiveWarning?.title ?? "この先は元に戻せません",
    body:
      policy.ephemeralArchiveWarning?.body ??
      "次へ進むと、この会計期間の圧縮済みデータはサーバから削除され、二度とダウンロードできません。必要な場合は先にダウンロードしてください。",
    confirmLabel:
      policy.ephemeralArchiveWarning?.confirmLabel ?? "理解して次期を作成",
  };

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
      if (isEphemeral && currentArchived) {
        await appState.purgeArchivedFiscalPeriod(currentFiscalPeriod.id);
        appState.assertAuthOperationCurrent(authOperationVersion);
      }
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
    setCarries((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleArchive = async () => {
    if (!canArchive) return;
    const release = workflowLock.current.tryAcquire();
    if (release == null) return;
    const authOperationVersion = appState.captureAuthOperationVersion();
    setIsArchiving(true);
    try {
      const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
      const [entries, fixedAssets, preClosed, closed] = await Promise.all([
        backendApi.entries.getAll(currentFiscalPeriod.id),
        backendApi.fixedAssets.getAll(currentFiscalPeriod.id),
        backendApi.preClosings.get(currentFiscalPeriod.id, year),
        backendApi.closings.get(currentFiscalPeriod.id, year),
      ]);
      appState.assertAuthOperationCurrent(authOperationVersion);
      const payload = buildFiscalPeriodArchivePayload({
        createdAt: new Date().toISOString(),
        fiscalPeriod: { ...currentFiscalPeriod, archiveStatus: "archived" },
        entries: entries.map((entry) => ({ ...entry })),
        fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
        closings: [
          ...(!preClosed
            ? []
            : [
                {
                  fiscalPeriodId: currentFiscalPeriod.id,
                  year,
                  kind: "pre_closing",
                },
              ]),
          ...(!closed
            ? []
            : [
                {
                  fiscalPeriodId: currentFiscalPeriod.id,
                  year,
                  kind: "closing",
                },
              ]),
        ],
      });
      const zip = createFiscalPeriodArchiveZip(payload);
      downloadBytes(
        zip,
        buildFiscalPeriodArchiveFilename(currentFiscalPeriod),
        "application/zip",
      );
      await appState.archiveFiscalPeriod(currentFiscalPeriod.id);
      appState.assertAuthOperationCurrent(authOperationVersion);
      setArchiveMessage("圧縮保存しました");
      setScreenError(null);
    } catch (error) {
      if (!appState.isAuthOperationCurrent(authOperationVersion)) return;
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "圧縮保存に失敗しました",
          fallbackDeveloperMessage:
            "steps/next-fiscal-period: archiveFiscalPeriod failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsArchiving(false);
      release();
    }
  };

  return (
    <>
      <FormStyles />
      <CheckboxStyles />

      {!canEnterPage ? (
        <>
          <StepCallout tone="warning">
            この手順はまだ進められません。
          </StepCallout>
          <StepDivider marginY={null} />
        </>
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
                  if (isNotStarted) return;
                  setNameEdited(true);
                  setName(value);
                }}
                readOnly={isNotStarted}
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
                    if (!isNotStarted) setStartDate(value);
                  }}
                  onChangeEnd={(value) => {
                    if (!isNotStarted) setEndDate(value);
                  }}
                  readOnly={isNotStarted}
                />
                {!isNotStarted && !dateValidation.ok ? (
                  <FormErrorText>{dateValidation.message}</FormErrorText>
                ) : !isNotStarted && hasOverlap ? (
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

      <StepDivider marginY={null} />

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
                      if (!isNotStarted) toggleCarry(item.id);
                    }}
                    label={item.label}
                    disabled={isNotStarted}
                  />
                ))}
              </div>
            }
            hint={null}
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
                      disabled={editingLocked || isCreating || isArchiving}
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
            {requiresArchiveBeforeNext && !currentArchived ? (
              <div style={{ marginTop: 16 }}>
                <StepCallout tone="info">
                  翌期を作成する前に、下の「圧縮保存」で現在の会計期間を保存してください。
                </StepCallout>
              </div>
            ) : null}
            {pendingAdvance ? (
              <div style={{ marginTop: 16 }}>
                <StepCallout tone="warning">
                  <span
                    style={{
                      display: "block",
                      fontWeight: fontWeight.bold,
                      marginBottom: 4,
                    }}
                  >
                    {ephemeralWarning.title}
                  </span>
                  {ephemeralWarning.body}
                </StepCallout>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                  }}
                >
                  <StepSecondaryButton
                    onClick={() => setPendingAdvance(false)}
                    disabled={false}
                  >
                    キャンセル
                  </StepSecondaryButton>
                  <StepPrimaryButton
                    onClick={() => {
                      setPendingAdvance(false);
                      void handleCreate();
                    }}
                    disabled={!canCreateNext}
                    variant="success"
                    icon={null}
                  >
                    {isCreating ? "作成中" : ephemeralWarning.confirmLabel}
                  </StepPrimaryButton>
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                {editingLocked ? (
                  <LockButton label="次期を作成" style={null} />
                ) : (
                  <StepPrimaryButton
                    onClick={() => {
                      if (!canCreateNext) return;
                      if (isEphemeral) setPendingAdvance(true);
                      else void handleCreate();
                    }}
                    disabled={!canCreateNext}
                    variant="success"
                    icon={null}
                  >
                    {isCreating ? "作成中" : "次期を作成"}
                  </StepPrimaryButton>
                )}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <StepSecondaryButton
              onClick={() => onSwitchToStep?.(5)}
              disabled={false}
            >
              前の手順へ
            </StepSecondaryButton>
          </div>
        )}
      </section>

      {nextPeriodFooter != null ? (
        <>
          <StepDivider marginY={null} />
          <StepCallout tone="info">{nextPeriodFooter}</StepCallout>
        </>
      ) : null}

      <StepDivider marginY={44} />

      <section>
        <StepSectionLabel>長期保存</StepSectionLabel>
        <StepMetaCard>
          <StepMetaRow
            label="圧縮保存"
            value="手続きが終わった会計期間のデータを長期保存するには圧縮保存しておくことがおすすめです。"
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
          {archiveMessage != null ? (
            <span
              style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                color: palette.success,
              }}
            >
              {archiveMessage}
            </span>
          ) : null}
          {editingLocked ? (
            <LockButton label="圧縮保存" style={null} />
          ) : (
            <StepPrimaryButton
              onClick={handleArchive}
              disabled={!canArchive}
              variant="success"
              icon={null}
            >
              {currentFiscalPeriod.archiveStatus !== "active"
                ? "圧縮保存済み"
                : isArchiving
                  ? "保存中"
                  : "圧縮保存"}
            </StepPrimaryButton>
          )}
        </div>
      </section>

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

function CarryCheckboxItem({
  inputId,
  checked,
  onChange,
  label,
  disabled,
}: {
  inputId: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <label
      htmlFor={inputId}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 40,
        paddingLeft: 4,
        paddingRight: 8,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        userSelect: "none",
        borderRadius: 6,
      }}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="bk-checkbox-input"
      />
      <span
        className="bk-checkbox-visual"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: 5,
          border: checked
            ? `1px solid ${palette.brand}`
            : `1.5px solid ${palette.borderStrong}`,
          background: checked ? palette.brand : palette.surface,
          flexShrink: 0,
          transition: "background 100ms ease, border-color 100ms ease",
        }}
      >
        {checked ? (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4 10-10"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span
        style={{
          fontSize: fontSize.base,
          fontWeight: fontWeight.medium,
          color: palette.text,
          lineHeight: 1.5,
        }}
      >
        {label}
      </span>
    </label>
  );
}

const checkboxStyles = `
  .bk-checkbox-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .bk-checkbox-input:focus-visible + .bk-checkbox-visual {
    box-shadow: ${rings.brandFocus};
  }
`;

function CheckboxStyles() {
  return <style>{checkboxStyles}</style>;
}
