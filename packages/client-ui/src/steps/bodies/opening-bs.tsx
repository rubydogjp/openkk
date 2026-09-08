"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  AppError,
  resolveEditingPolicy,
  type EntryAccountVisualType,
} from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
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
  shadows,
  sizes,
  spacing,
  typography,
} from "../../shared/design-tokens.js";
import { LockButton, LockIcon } from "../../shared/lock-icon.js";
import { FormStyles } from "../../shared/form-fields.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  StepCallout,
  StepPrimaryButton,
  StepSecondaryButton,
} from "../step-ui.js";
import {
  BS_ROWS,
  assetKey,
  buildAssetSlots,
  buildInitialAmounts,
  buildLiabilitySlots,
  isEditableLiability,
  liabilityAccountType,
  liabilityKey,
  parseOpeningAmount,
  sumOpeningAmounts,
} from "./opening-bs-model.js";

const ORDINARY_DEPOSIT_ACCOUNT_ID_INCLUDED_IN_OTHER_DEPOSITS = "a:普通預金";

export function OpeningBsBody({
  onSwitchToStep,
}: {
  onSwitchToStep: ((no: number) => void) | null;
}) {
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(new ExclusiveActionLock());
  const [isEditingCompleted, setIsEditingCompleted] = useState(false);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  const openingBalanceLines =
    currentFiscalPeriod?.opening?.openingBalanceLines ?? [];
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    buildInitialAmounts(openingBalanceLines),
  );
  const assetSlots = useMemo(
    () => buildAssetSlots(openingBalanceLines),
    [openingBalanceLines],
  );
  const liabilitySlots = useMemo(
    () => buildLiabilitySlots(openingBalanceLines),
    [openingBalanceLines],
  );
  const visibleAccountIds = useMemo(
    () =>
      new Set([
        ...assetSlots
          .filter((slot) => slot.label !== "")
          .map((slot) => assetKey(slot.label)),
        ...liabilitySlots
          .filter((slot) => slot.label !== "")
          .map((slot) => liabilityKey(slot.label)),
        ORDINARY_DEPOSIT_ACCOUNT_ID_INCLUDED_IN_OTHER_DEPOSITS,
      ]),
    [assetSlots, liabilitySlots],
  );
  const preservedUnrenderedLines = useMemo(
    () =>
      openingBalanceLines.filter(
        (line) => !visibleAccountIds.has(line.accountId) && line.amount > 0,
      ),
    [openingBalanceLines, visibleAccountIds],
  );

  useEffect(() => {
    setAmounts(buildInitialAmounts(openingBalanceLines));
    setIsEditingCompleted(false);
    setScreenError(null);
  }, [currentFiscalPeriod?.id, openingBalanceLines]);

  const assetTotal = useMemo(() => {
    return sumOpeningAmounts([
      ...assetSlots
        .filter((slot) => slot.label !== "")
        .map((slot) => amounts[assetKey(slot.label)] ?? ""),
      ...preservedUnrenderedLines
        .filter((line) => line.accountId.startsWith("a:"))
        .map((line) => line.amount),
    ]);
  }, [amounts, assetSlots, preservedUnrenderedLines]);

  const liabilityTotal = useMemo(() => {
    return sumOpeningAmounts([
      ...liabilitySlots
        .filter((slot) => slot.label !== "")
        .map((slot) => amounts[liabilityKey(slot.label)] ?? ""),
      ...preservedUnrenderedLines
        .filter((line) => line.accountId.startsWith("l:"))
        .map((line) => line.amount),
    ]);
  }, [amounts, liabilitySlots, preservedUnrenderedLines]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }
  const isNotStarted = !currentFiscalPeriod.settingsCompleted;
  const editingLocked = resolveEditingPolicy(config).locked;

  const isPeriodLocked =
    currentFiscalPeriod.phase === "post_closing" ||
    currentFiscalPeriod.phase === "pre_closing";

  const isCompleted = currentFiscalPeriod.openingBalancesCompleted;
  const isEditing =
    !isNotStarted &&
    !isPeriodLocked &&
    !editingLocked &&
    (!isCompleted || isEditingCompleted);
  const amountsAreSafe = assetTotal != null && liabilityTotal != null;
  const balancesMatch =
    amountsAreSafe && assetTotal === liabilityTotal;

  const handleSave = async () => {
    const release = saveLock.current.tryAcquire();
    if (release == null) return;
    setIsSaving(true);
    try {
      if (!balancesMatch) return;
      const lines = [
        ...assetSlots.flatMap((slot) => {
          if (slot.label === "") return [];
          const key = assetKey(slot.label);
          const amount = parseOpeningAmount(amounts[key] ?? "") ?? 0;
          if (amount <= 0) return [];
          return [{ id: key, accountId: key, amount }];
        }),
        ...liabilitySlots.flatMap((slot) => {
          if (!isEditableLiability(slot.label)) return [];
          const key = liabilityKey(slot.label);
          const amount = parseOpeningAmount(amounts[key] ?? "") ?? 0;
          if (amount <= 0) return [];
          return [{ id: key, accountId: key, amount }];
        }),
        ...preservedUnrenderedLines,
      ];
      const updated = await appState.updateFiscalPeriod(
        currentFiscalPeriod.id,
        (latestPeriod) => {
          const latestOpening = latestPeriod.opening ?? {
            id: `op-${currentFiscalPeriod.id}`,
            userId: appState.session?.user.id ?? "",
            fiscalPeriodId: currentFiscalPeriod.id,
            openingJournals: [],
          };
          return {
            openingBalancesCompleted: true,
            opening: {
              ...latestOpening,
              openingBalanceLines: lines,
            },
          };
        },
      );
      if (!updated) return;
      setScreenError(null);
      setIsEditingCompleted(false);
      onSwitchToStep?.(3);
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
            {resolveEditingPolicy(config).lockedNotice ??
              "この環境ではデータの編集がロックされています。"}
          </StepCallout>
        ) : null}

        {!isPeriodLocked && isCompleted && !isEditing ? (
          <SavedCommentSection
            editingLocked={editingLocked}
            onEdit={() => setIsEditingCompleted(true)}
          />
        ) : null}

        <div
          style={{
            background: palette.surface,
            border: `1px solid ${palette.borderEmphasis}`,
            borderRadius: 12,
            boxShadow: shadows.card,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 1,
              background: palette.borderEmphasis,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLUMNS,
              alignItems: "center",
              height: sizes.field.height,
              background: palette.headerSurface,
              borderBottom: `1px solid ${palette.borderSubtle}`,
            }}
          >
            <HeaderCell align={null}>資産の部</HeaderCell>
            <HeaderCell align="right">金額</HeaderCell>
            <HeaderCell align={null}>負債・純資産の部</HeaderCell>
            <HeaderCell align="right">金額</HeaderCell>
          </div>

          {BS_ROWS.map((_, index) => {
            const assetSlot = assetSlots[index];
            const liabilitySlot = liabilitySlots[index];
            if (!assetSlot || !liabilitySlot) return null;
            const assetLabel = assetSlot.label;
            const liabilityLabel = liabilitySlot.label;
            const assetId = assetKey(assetLabel);
            const liabilityId = liabilityKey(liabilityLabel);
            const assetAmount = amounts[assetId] ?? "";
            const liabilityAmount = amounts[liabilityId] ?? "";
            const assetEditable = assetLabel !== "" && isEditing;
            const liabilityEditable = liabilityLabel !== "" && isEditing;
            return (
              <div
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLUMNS,
                  alignItems: "center",
                  height: 52,
                  background: palette.surface,
                }}
              >
                <ChipCell label={assetLabel} type="asset" />
                <AmountCell
                  hasLabel={assetLabel !== ""}
                  editable={assetEditable}
                  ariaLabel={`${assetLabel} 金額`}
                  value={assetAmount}
                  onChange={(v) => setAmounts((p) => ({ ...p, [assetId]: v }))}
                />
                <ChipCell
                  label={liabilityLabel}
                  type={liabilityAccountType(liabilityLabel)}
                />
                <AmountCell
                  hasLabel={liabilityLabel !== ""}
                  editable={liabilityEditable}
                  ariaLabel={`${liabilityLabel} 金額`}
                  value={liabilityAmount}
                  onChange={(v) =>
                    setAmounts((p) => ({ ...p, [liabilityId]: v }))
                  }
                />
              </div>
            );
          })}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLUMNS,
              alignItems: "center",
              height: 48,
              background: palette.headerSurface,
              borderTop: `1px solid ${palette.borderStrong}`,
            }}
          >
            <TotalLabelCell>合計</TotalLabelCell>
            <TotalAmountCell>
              {formatOpeningTotal(assetTotal)}
            </TotalAmountCell>
            <TotalLabelCell>合計</TotalLabelCell>
            <TotalAmountCell>
              {formatOpeningTotal(liabilityTotal)}
            </TotalAmountCell>
          </div>
        </div>

        {isEditing && !amountsAreSafe ? (
          <StepCallout tone="warning">
            金額または合計が大きすぎるため、安全に計算できる金額へ修正してください。
          </StepCallout>
        ) : isEditing && !balancesMatch ? (
          <StepCallout tone="warning">
            資産合計と負債・純資産合計を一致させてください。
          </StepCallout>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: isNotStarted ? "flex-start" : "flex-end",
          }}
        >
          {isNotStarted ? (
            <StepSecondaryButton onClick={() => onSwitchToStep?.(1)}>
              前の手順へ
            </StepSecondaryButton>
          ) : editingLocked && !isCompleted ? (
            <LockButton label="保存して次へ" style={null} />
          ) : !isEditing ? (
            <StepPrimaryButton onClick={() => onSwitchToStep?.(3)} variant={null} icon={null}>
              次の手順へ
            </StepPrimaryButton>
          ) : (
            <StepPrimaryButton
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

        {screenError != null ? <AppErrorText error={screenError} style={null} fallbackUserMessage={null} /> : null}
      </div>
    </>
  );
}

function formatOpeningTotal(value: number | null): string {
  return value == null ? "—" : value.toLocaleString("ja-JP");
}

function SavedCommentSection({
  editingLocked,
  onEdit,
}: {
  editingLocked: boolean;
  onEdit: () => void;
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
          保存済み
        </div>
        <div
          style={{
            fontSize: fontSize.base,
            color: palette.textSoft,
            lineHeight: 1.6,
          }}
        >
          仮締めまでの間は編集することが可能です
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
            onClick={editingLocked ? undefined : onEdit}
            disabled={editingLocked}
            style={{
              height: sizes.button.compactHeight,
              minWidth: sizes.button.compactMinWidth,
              padding: "0 14px",
              borderRadius: radii.sm,
              border: `1px solid ${editingLocked ? palette.borderStrong : palette.brand}`,
              background: palette.surface,
              color: editingLocked ? palette.textSoft : palette.brand,
              ...typography.control,
              cursor: editingLocked ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.s8,
            }}
          >
            {editingLocked ? <LockIcon size={18} /> : null}
            <span>編集する</span>
          </button>
        </div>
      </div>
    </StepCallout>
  );
}

const AMOUNT_INPUT_W = 120;
const GRID_COLUMNS = "1fr 1fr 1fr 1fr";

function HeaderCell({
  children,
  align,
}: {
  children: ReactNode;
  align: "left" | "right" | null;
}) {
  if (align === "right") {
    return (
      <div
        style={{
          paddingLeft: 12,
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <div
          style={{
            width: AMOUNT_INPUT_W,
            textAlign: "right",
            fontSize: fontSize.xs,
            fontWeight: fontWeight.bold,
            color: palette.text,
            letterSpacing: "0.02em",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "0 12px",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        color: palette.text,
        letterSpacing: "0.02em",
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}

function ChipCell({
  label,
  type,
}: {
  label: string;
  type: EntryAccountVisualType;
}) {
  if (label === "") {
    return <div />;
  }

  return (
    <div style={{ paddingLeft: 10 }}>
      <AccountChipCell label={label} type={type} />
    </div>
  );
}

function AmountCell({
  hasLabel,
  editable,
  ariaLabel,
  value,
  onChange,
}: {
  hasLabel: boolean;
  editable: boolean;
  ariaLabel: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  if (!hasLabel) {
    return <div />;
  }

  return (
    <div
      style={{ paddingLeft: 12, display: "flex", justifyContent: "flex-start" }}
    >
      <div style={{ width: AMOUNT_INPUT_W }}>
        {editable ? (
          <AmountInput
            value={value}
            onChange={onChange}
            ariaLabel={ariaLabel}
          />
        ) : (
          <AmountReadOnlyField
            value={value !== "" ? Number(value).toLocaleString("ja-JP") : ""}
          />
        )}
      </div>
    </div>
  );
}

function TotalLabelCell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "0 12px",
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
    <div
      style={{ paddingLeft: 12, display: "flex", justifyContent: "flex-start" }}
    >
      <div style={{ width: AMOUNT_INPUT_W, textAlign: "right" }}>
        <AmountText bold>{children}</AmountText>
      </div>
    </div>
  );
}
