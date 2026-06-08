"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AppError,
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchivePayload,
  buildNextFiscalPeriodSuggestion,
  buildOpeningBalanceLinesFromClosingBsRows,
  buildOpeningCarryoverJournalsFromReversibleEntries,
  computeFsAggregate,
  createFiscalPeriodArchiveZip,
  resolveFiscalPeriodPolicy,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
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
} from "../../shared/design-tokens";
import { DemoLockButton } from "../../shared/demo-icon";
import { downloadBytes } from "../../shared/download";
import {
  FormDatePair,
  FormStyles,
  FormTextInput,
} from "../../shared/form-fields";
import {
  StepDivider,
  StepFormRow,
  StepCallout,
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
} from "../step-ui";

const CARRY_ITEMS: Array<{ id: string; label: string }> = [
  { id: "bs", label: "期末のBS → 翌期首のBS" },
  { id: "transfer", label: "期末の振替 → 翌期首の再振替" },
  { id: "fixed", label: "固定資産データ" },
];

export function NextFiscalPeriodBody({
  onSwitchToStep,
}: {
  onSwitchToStep?: (no: number) => void;
}) {
  const config = useOpenkkConfig();
  const demoFooterCallout = useOpenkkCallout("stepNextFiscalPeriodDemoFooter");
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [archiveStatus, setArchiveStatus] = useState<string | null>(null);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  const suggested = useMemo(() => {
    if (currentFiscalPeriod == null)
      return { name: "", startDate: "", endDate: "" };
    return buildNextFiscalPeriodSuggestion({
      startDate: currentFiscalPeriod.startDate,
      endDate: currentFiscalPeriod.endDate,
    });
  }, [currentFiscalPeriod]);

  const [name, setName] = useState(suggested.name);
  const [startDate, setStartDate] = useState(suggested.startDate);
  const [endDate, setEndDate] = useState(suggested.endDate);
  const [nameEdited, setNameEdited] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [carries, setCarries] = useState<Record<string, boolean>>({
    bs: true,
    transfer: true,
    fixed: true,
  });

  useEffect(() => {
    if (currentFiscalPeriod == null) return;
    setName(suggested.name);
    setStartDate(suggested.startDate);
    setEndDate(suggested.endDate);
    setNameEdited(false);
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

  const policy = resolveFiscalPeriodPolicy(config);
  const requiresArchiveBeforeNext =
    policy.maxActivePeriods != null && policy.maxActivePeriods <= 1;
  const isEphemeral = policy.archiveRetention === "ephemeral";
  const currentArchived = currentFiscalPeriod.archiveStatus === "archived";

  const canEnterPage = currentFiscalPeriod.phase === "post_closing";
  const isNotStarted = !canEnterPage;
  const canCreateNext =
    canEnterPage &&
    currentFiscalPeriod.documentsReceivedCompleted &&
    !config.isDemoMode &&
    !isCreating &&
    name.trim() !== "" &&
    startDate.trim() !== "" &&
    endDate.trim() !== "" &&
    (!requiresArchiveBeforeNext || currentArchived);
  const isDemo = config.isDemoMode;
  const canArchive =
    currentFiscalPeriod != null &&
    currentFiscalPeriod.archiveStatus !== "archived" &&
    !config.isDemoMode &&
    !isArchiving;

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
    setIsCreating(true);
    try {
      const createdId = await appState.createFiscalPeriod(
        {
          name,
          startDate,
          endDate,
        },
        { select: false },
      );
      if (createdId == null) return;
      if (carries.bs || carries.transfer) {
        const entries = entriesState.listFiscalPeriodEntries(
          currentFiscalPeriod.id,
        );
        const aggregate = computeFsAggregate({
          openingBalanceLines:
            currentFiscalPeriod.opening?.openingBalanceLines ?? [],
          entries,
        });
        const openingBalanceLines = buildOpeningBalanceLinesFromClosingBsRows(
          aggregate.bsRows,
        );
        const openingJournals = carries.transfer
          ? buildOpeningCarryoverJournalsFromReversibleEntries({
              entries,
              nextFiscalPeriodId: createdId,
              nextStartDate: startDate,
            })
          : [];
        await appState.updateFiscalPeriod(createdId, {
          openingBalancesCompleted: carries.bs,
          opening: {
            id: `op-${createdId}`,
            userId: appState.session?.user.id ?? "",
            fiscalPeriodId: createdId,
            openingBalanceLines: carries.bs
              ? openingBalanceLines.map((line) => ({
                  id: line.accountId,
                  ...line,
                }))
              : [],
            openingJournals,
          },
        });
      }
      if (carries.fixed) {
        const fixedAssets = await backendApi.fixedAssets.getAll(
          currentFiscalPeriod.id,
        );
        for (const asset of fixedAssets) {
          if (asset.status !== "active") continue;
          await backendApi.fixedAssets.create(createdId, {
            name: asset.name,
            acquisitionDate: asset.acquisitionDate,
            acquisitionCost: asset.acquisitionCost,
            usefulLife: Math.max(1, Math.round(asset.usefulLife) || 1),
            depreciationMethod: asset.depreciationMethod,
            businessRate: asset.businessRate,
            bookAccountId: asset.bookAccountId,
          });
        }
      }
      if (isEphemeral && currentArchived) {
        await appState.purgeArchivedFiscalPeriod(currentFiscalPeriod.id);
      }
      setScreenError(null);
      appState.selectFiscalPeriod(createdId);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "次の期間の作成に失敗しました",
          fallbackDeveloperMessage:
            "steps/next-fiscal-period: createFiscalPeriod failed",
        }),
      );
    } finally {
      setIsCreating(false);
    }
  };

  const toggleCarry = (id: string) =>
    setCarries((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleArchive = async () => {
    if (!canArchive) return;
    setIsArchiving(true);
    try {
      const year = Number(currentFiscalPeriod.endDate.slice(0, 4));
      const [entries, fixedAssets, preClosing, closing] = await Promise.all([
        backendApi.entries.getAll(currentFiscalPeriod.id),
        backendApi.fixedAssets.getAll(currentFiscalPeriod.id),
        backendApi.preClosing.get(currentFiscalPeriod.id, year),
        backendApi.closing.get(currentFiscalPeriod.id, year),
      ]);
      const payload = buildFiscalPeriodArchivePayload({
        createdAt: new Date().toISOString(),
        fiscalPeriod: { ...currentFiscalPeriod, archiveStatus: "archived" },
        entries: entries.map((entry) => ({ ...entry })),
        fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
        closings: [
          ...(preClosing == null
            ? []
            : [
                {
                  fiscalPeriodId: currentFiscalPeriod.id,
                  year,
                  kind: "pre_closing",
                },
              ]),
          ...(closing == null
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
      await appState.archiveFiscalPeriod(currentFiscalPeriod.id);
      downloadBytes(
        zip,
        buildFiscalPeriodArchiveFilename(currentFiscalPeriod),
        "application/zip",
      );
      setArchiveStatus("圧縮保存しました");
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "圧縮保存に失敗しました",
          fallbackDeveloperMessage:
            "steps/next-fiscal-period: archiveFiscalPeriod failed",
        }),
      );
    } finally {
      setIsArchiving(false);
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
          <StepDivider />
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
          />
          <StepFormRow
            label="期間"
            divider
            control={
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
            }
          />
        </StepMetaCard>
      </section>

      <StepDivider />

      <section>
        <StepSectionLabel>引き継ぎ</StepSectionLabel>
        <StepMetaCard>
          <StepMetaRow label="引き継ぎ元" value={currentFiscalPeriod.name} />
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
                    checked={carries[item.id] ?? false}
                    onChange={() => {
                      if (!isNotStarted) toggleCarry(item.id);
                    }}
                    label={item.label}
                    disabled={isNotStarted}
                  />
                ))}
              </div>
            }
          />
        </StepMetaCard>
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
                  <StepSecondaryButton onClick={() => setPendingAdvance(false)}>
                    キャンセル
                  </StepSecondaryButton>
                  <StepPrimaryButton
                    onClick={() => {
                      setPendingAdvance(false);
                      void handleCreate();
                    }}
                    disabled={!canCreateNext}
                    variant="success"
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
                {isDemo ? (
                  <DemoLockButton label="次期を作成" />
                ) : (
                  <StepPrimaryButton
                    onClick={() => {
                      if (!canCreateNext) return;
                      if (isEphemeral) setPendingAdvance(true);
                      else void handleCreate();
                    }}
                    disabled={!canCreateNext}
                    variant="success"
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
            <StepSecondaryButton onClick={() => onSwitchToStep?.(5)}>
              前の手順へ
            </StepSecondaryButton>
          </div>
        )}
      </section>

      {isDemo && demoFooterCallout != null ? (
        <>
          <StepDivider />
          <StepCallout tone="info">{demoFooterCallout}</StepCallout>
        </>
      ) : null}

      <StepDivider marginY={44} />

      <section>
        <StepSectionLabel>長期保存</StepSectionLabel>
        <StepMetaCard>
          <StepMetaRow
            label="圧縮保存"
            value="手続きが終わった会計期間のデータを長期保存するには圧縮保存しておくことがおすすめです。"
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
          {archiveStatus != null ? (
            <span
              style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                color: palette.success,
              }}
            >
              {archiveStatus}
            </span>
          ) : null}
          {isDemo ? (
            <DemoLockButton label="圧縮保存" />
          ) : (
            <StepPrimaryButton
              onClick={handleArchive}
              disabled={!canArchive}
              variant="success"
            >
              {currentFiscalPeriod.archiveStatus === "archived"
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
          <AppErrorText error={screenError} />
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
  disabled = false,
}: {
  inputId: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
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
