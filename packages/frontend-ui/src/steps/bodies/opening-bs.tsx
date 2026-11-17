"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AppError,
  formatAmount,
  type BookAccountType,
} from "@rubydogjp/openkk-driver";
import { AppErrorText } from "../../shared/app-error-text.js";
import { useOpenkkAppState, useOpenkkConfig } from "../../bindings/index.js";
import { AccountChipCell } from "../../entries/entries-ui.js";
import {
  AmountInput,
  AmountReadOnlyField,
  AmountText,
} from "../../shared/amount-field.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
  typography,
} from "../../shared/design-tokens.js";
import { LockButton } from "../../shared/locked-action.js";
import { FormMessageSlot, FormStyles } from "../../shared/form-fields.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  StepCallout,
  StepPrimaryButton,
  StepSecondaryButton,
} from "../step-ui.js";
import {
  assetKey,
  buildAssetLabels,
  buildInitialAmounts,
  enteredOpeningLines,
  buildLiabilityLabels,
  formatOpeningRowAmount,
  isCapitalRow,
  liabilityAccountType,
  liabilityKey,
  openingAmountsAreValid,
  sumOpeningSection,
  unrenderedOpeningLines,
} from "./opening-bs-model.js";
import {
  carryoverSourceCandidates,
  OpeningBsCarryover,
} from "./opening-bs-carryover.js";

export function OpeningBsBody({
  onSwitchToStep,
}: {
  onSwitchToStep: (no: number) => void;
}) {
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(new ExclusiveActionLock());
  const [isEditingCompleted, setIsEditingCompleted] = useState(false);
  const amountsProblemId = useId();
  const currentFiscalPeriod = appState.currentFiscalPeriod;

  const openingBalanceLines = currentFiscalPeriod?.opening.balanceLines ?? [];
  const savedOpeningBalances = JSON.stringify(openingBalanceLines);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    buildInitialAmounts(openingBalanceLines),
  );
  const assetLabels = useMemo(
    () => buildAssetLabels(openingBalanceLines),
    [openingBalanceLines],
  );
  const liabilityLabels = useMemo(
    () => buildLiabilityLabels(openingBalanceLines),
    [openingBalanceLines],
  );
  const preservedUnrenderedLines = useMemo(
    () =>
      unrenderedOpeningLines(openingBalanceLines, assetLabels, liabilityLabels),
    [openingBalanceLines, assetLabels, liabilityLabels],
  );

  useEffect(() => {
    setAmounts(buildInitialAmounts(openingBalanceLines));
    setIsEditingCompleted(false);
    setScreenError(null);
  }, [currentFiscalPeriod?.id, savedOpeningBalances]);

  const assetTotal = useMemo(
    () =>
      sumOpeningSection(
        "asset",
        assetLabels,
        amounts,
        preservedUnrenderedLines,
      ),
    [amounts, assetLabels, preservedUnrenderedLines],
  );
  const liabilityTotal = useMemo(
    () =>
      sumOpeningSection(
        "liability",
        liabilityLabels,
        amounts,
        preservedUnrenderedLines,
      ),
    [amounts, liabilityLabels, preservedUnrenderedLines],
  );

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }
  const isNotStarted = currentFiscalPeriod.phase === "pre_opening";
  const editingLocked = config.editingPolicy.locked;

  const isPeriodLocked =
    currentFiscalPeriod.phase === "post_closing" ||
    currentFiscalPeriod.phase === "pre_closing";

  const isCompleted = currentFiscalPeriod.openingBalancesCompleted;
  const isEditing =
    !isNotStarted &&
    !isPeriodLocked &&
    !editingLocked &&
    (!isCompleted || isEditingCompleted);
  const carryoverSources =
    currentFiscalPeriod.phase === "journalizing" && !editingLocked
      ? carryoverSourceCandidates(currentFiscalPeriod, appState.fiscalPeriods)
      : [];
  const amountsAreWhole = openingAmountsAreValid(amounts);
  const amountsAreSafe = assetTotal != null && liabilityTotal != null;
  const balancesMatch = amountsAreSafe && assetTotal === liabilityTotal;

  const handleSave = async () => {
    if (!balancesMatch) return;
    const release = saveLock.current.tryAcquire();
    if (release == null) return;
    setIsSaving(true);
    try {
      const lines = [
        ...enteredOpeningLines(
          "asset",
          assetLabels,
          amounts,
          openingBalanceLines,
        ),
        ...enteredOpeningLines(
          "liability",
          liabilityLabels,
          amounts,
          openingBalanceLines,
        ),
        ...preservedUnrenderedLines,
      ];
      const updated = await appState.updateFiscalPeriod(
        currentFiscalPeriod.id,
        (latestPeriod) => {
          return {
            openingBalancesCompleted: true,
            opening: {
              balanceLines: lines,
              journals: latestPeriod.opening.journals,
            },
          };
        },
      );
      if (!updated) return;
      setScreenError(null);
      setIsEditingCompleted(false);
      onSwitchToStep(3);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "期首のBSの更新に失敗しました",
          fallbackDeveloperMessage:
            "steps/opening-bs: updateFiscalPeriod failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsSaving(false);
      release();
    }
  };

  return (
    <>
      <FormStyles />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          paddingBottom: 56,
        }}
      >
        {isNotStarted ? (
          <StepCallout tone="warning">
            この手順はまだ進められません。
          </StepCallout>
        ) : null}

        {isPeriodLocked ? (
          <StepCallout tone="info">
            仮締め以降のため変更できません。
          </StepCallout>
        ) : null}

        {!isPeriodLocked && editingLocked ? (
          <StepCallout tone="info">
            {config.editingPolicy.lockedNotice}
          </StepCallout>
        ) : null}

        {!isPeriodLocked && !editingLocked && isCompleted ? (
          <SavedOpeningBsNotice
            isEditing={isEditing}
            canCarryOver={carryoverSources.length > 0}
            onEdit={() => setIsEditingCompleted(true)}
            onCancel={() => {
              setAmounts(buildInitialAmounts(openingBalanceLines));
              setIsEditingCompleted(false);
              setScreenError(null);
            }}
          />
        ) : null}

        {carryoverSources.length > 0 ? (
          <OpeningBsCarryover
            target={currentFiscalPeriod}
            sources={carryoverSources}
          />
        ) : null}

        <div className="bk-opening-bs">
          <div className="bk-opening-bs-sections">
            {[
              {
                title: "資産の部",
                labels: assetLabels,
                key: assetKey,
                total: assetTotal,
                accountType: (_label: string): BookAccountType => "asset",
              },
              {
                title: "負債・純資産の部",
                labels: liabilityLabels,
                key: liabilityKey,
                total: liabilityTotal,
                accountType: liabilityAccountType,
              },
            ].map((section) => (
              <section key={section.title} aria-label={section.title}>
                <div className="bk-opening-bs-row bk-opening-bs-header">
                  <HeaderCell align="left">{section.title}</HeaderCell>
                  <HeaderCell align="right">金額</HeaderCell>
                </div>
                {section.labels.map((label, index) => {
                  const id = section.key(label);
                  return (
                    <div
                      key={index}
                      className={`bk-opening-bs-row${label === "" ? " bk-opening-bs-empty" : ""}`}
                    >
                      <ChipCell
                        label={label}
                        type={section.accountType(label)}
                      />
                      <AmountCell
                        hasLabel={label !== ""}
                        editable={isEditing}
                        ariaLabel={`${label} 金額`}
                        rowKey={id}
                        value={amounts[id] ?? ""}
                        onChange={(value) =>
                          setAmounts((previous) => ({
                            ...previous,
                            [id]: value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
                <div className="bk-opening-bs-row bk-opening-bs-total">
                  <TotalLabelCell>合計</TotalLabelCell>
                  <TotalAmountCell>
                    {formatOpeningTotal(section.total)}
                  </TotalAmountCell>
                </div>
              </section>
            ))}
          </div>
        </div>

        {isEditing ? (
          <FormMessageSlot tone="error" id={amountsProblemId}>
            {!amountsAreWhole
              ? "金額は 0 以上の整数で入れてください。"
              : !amountsAreSafe
                ? "金額や合計が大きすぎます。9,000 兆円未満にしてください。"
                : !balancesMatch
                  ? "資産合計と負債・純資産合計を一致させてください。"
                  : null}
          </FormMessageSlot>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: isNotStarted ? "flex-start" : "flex-end",
          }}
        >
          {isNotStarted ? (
            <StepSecondaryButton onClick={() => onSwitchToStep(1)}>
              前の手順へ
            </StepSecondaryButton>
          ) : editingLocked && !isCompleted ? (
            <LockButton label="保存して次へ" />
          ) : !isEditing ? (
            <StepPrimaryButton
              describedBy={null}
              onClick={() => onSwitchToStep(3)}
              disabled={false}
              variant={null}
              icon={null}
            >
              次の手順へ
            </StepPrimaryButton>
          ) : (
            <StepPrimaryButton
              describedBy={balancesMatch ? null : amountsProblemId}
              onClick={handleSave}
              disabled={isSaving || !balancesMatch}
              variant="success"
              icon={null}
            >
              {isSaving
                ? "保存中…"
                : isCompleted
                  ? "上書き保存"
                  : "保存して次へ"}
            </StepPrimaryButton>
          )}
        </div>

        {screenError != null ? (
          <AppErrorText
            error={screenError}
            style={null}
            fallbackUserMessage={null}
          />
        ) : null}
      </div>
    </>
  );
}

function formatOpeningTotal(value: number | null): string {
  return value == null ? "—" : formatAmount(value);
}

function SavedOpeningBsNotice({
  isEditing,
  canCarryOver,
  onEdit,
  onCancel,
}: {
  isEditing: boolean;
  canCarryOver: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <StepCallout tone="info">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.bold,
            color: palette.text,
            lineHeight: 1.5,
          }}
        >
          {isEditing ? "編集中" : "保存済み"}
        </div>
        <div
          style={{
            fontSize: fontSize.base,
            color: palette.textSoft,
            lineHeight: 1.6,
          }}
        >
          {canCarryOver
            ? "仮締めまでの間は、いつでも金額を編集したり、前の期間から引き継ぎ直したりできます"
            : "仮締めまでの間は、いつでも金額を編集できます"}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={isEditing ? onCancel : onEdit}
            style={{
              height: sizes.button.compactHeight,
              minWidth: sizes.button.compactMinWidth,
              padding: "0 14px",
              borderRadius: radii.sm,
              border: `1px solid ${palette.brand}`,
              background: palette.surface,
              color: palette.brand,
              ...typography.control,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.s8,
            }}
          >
            <span>{isEditing ? "キャンセル" : "編集する"}</span>
          </button>
        </div>
      </div>
    </StepCallout>
  );
}

function HeaderCell({
  children,
  align,
}: {
  children: ReactNode;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        color: palette.text,
        letterSpacing: "0.02em",
        textAlign: align,
      }}
    >
      {children}
    </div>
  );
}

function ChipCell({ label, type }: { label: string; type: BookAccountType }) {
  if (label === "") {
    return <div />;
  }

  return (
    <div>
      <AccountChipCell label={label} type={type} />
    </div>
  );
}

function AmountCell({
  hasLabel,
  editable,
  ariaLabel,
  rowKey,
  value,
  onChange,
}: {
  hasLabel: boolean;
  editable: boolean;
  ariaLabel: string;
  rowKey: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  if (!hasLabel) {
    return <div />;
  }

  return (
    <div style={{ minWidth: 0 }}>
      {editable ? (
        <AmountInput
          value={value}
          onChange={onChange}
          ariaLabel={ariaLabel}
          signed={isCapitalRow(rowKey)}
        />
      ) : (
        <AmountReadOnlyField value={formatOpeningRowAmount(rowKey, value)} />
      )}
    </div>
  );
}

function TotalLabelCell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        color: palette.text,
      }}
    >
      {children}
    </div>
  );
}

function TotalAmountCell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minWidth: 0, textAlign: "right" }}>
      <AmountText bold>{children}</AmountText>
    </div>
  );
}
