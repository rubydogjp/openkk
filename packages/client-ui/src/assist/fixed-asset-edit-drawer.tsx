"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import { AmountInput } from "../shared/amount-field.js";
import { useConfirmDialog } from "../shared/confirm-dialog.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { useModalLifecycle } from "../shared/dismissible-layer.js";
import { DrawerFrame } from "../shared/drawer-frame.js";
import { debugAppError } from "../shared/app-error-text.js";
import { safeUserErrorMessage } from "../shared/safe-error-message.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  typography,
} from "../shared/design-tokens.js";
import {
  FormStyles,
  FormPrimaryButton,
  FormSecondaryButton,
  FormTextInput,
} from "../shared/form-fields.js";
import {
  computeFixedAssetDraftPeriodDepreciation,
  computeStraightLineDepreciation,
  FIXED_ASSET_STATUS_LABELS,
  fixedAssetStatusRequiresDisposal,
  MAX_FIXED_ASSET_USEFUL_LIFE_YEARS,
  formatAmount,
  parseAmount,
  parseIsoLocalDate,
  resolveFixedAssetDraftPreviewDate,
  validateFixedAssetDraft,
  type FixedAssetDraft,
  type FixedAssetStatus,
} from "@rubydogjp/openkk-client-domain";

export function FixedAssetEditDrawer({
  mode,
  initialDraft,
  periodStartDate,
  periodEndDate,
  previewAsOf,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  initialDraft: FixedAssetDraft;
  periodStartDate: string;
  periodEndDate: string;
  previewAsOf: Date;
  onClose: () => void;
  onSave: (draft: FixedAssetDraft) => Promise<boolean>;
  onDelete: (() => Promise<boolean>) | null;
}) {
  const [draft, setDraft] = useState<FixedAssetDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const mutationLock = useRef(new ExclusiveActionLock());
  const { confirm, dialog } = useConfirmDialog();
  const needsDisposalDate = fixedAssetStatusRequiresDisposal(draft.status);
  const needsDisposalPrice = draft.status === "sold";

  const calculatedPreview = useMemo(() => {
    const asOf = resolveFixedAssetDraftPreviewDate(
      previewAsOf,
      draft.status,
      draft.disposalDate,
      parseIsoLocalDate(periodEndDate) ?? previewAsOf,
    );
    return {
      ...computeStraightLineDepreciation({
        acquisitionDate: draft.acquisitionDate,
        acquisitionCost: parseAmount(draft.acquisitionCost),
        usefulLife: draft.usefulLife,
        asOf,
      }),
      periodDepreciation: computeFixedAssetDraftPeriodDepreciation({
        draft,
        periodStartDate,
        asOf,
      }),
    };
  }, [
    draft.acquisitionDate,
    draft.acquisitionCost,
    draft.disposalDate,
    draft.status,
    draft.usefulLife,
    periodEndDate,
    periodStartDate,
    previewAsOf,
  ]);
  const validationError = validateFixedAssetDraft({
    draft,
    periodStartDate,
    periodEndDate,
    currentBookValue: calculatedPreview.currentBookValue,
  });
  const canSave = validationError == null;

  const requestClose = () => {
    if (!mutationLock.current.isLocked) onClose();
  };
  const drawerRef = useModalLifecycle<HTMLElement>(requestClose, null);

  const handleSave = async () => {
    if (!canSave) {
      setErrorText(validationError);
      return;
    }
    const release = mutationLock.current.tryAcquire();
    if (release == null) return;
    setSaving(true);
    setErrorText(null);
    try {
      const ok = await onSave(draft);
      if (!ok) setErrorText("保存に失敗しました");
      else onClose();
    } catch (error) {
      debugAppError(error);
      setErrorText(safeUserErrorMessage(error, "保存に失敗しました"));
    } finally {
      setSaving(false);
      release();
    }
  };

  const handleDelete = async () => {
    if (onDelete == null) return;
    const release = mutationLock.current.tryAcquire();
    if (release == null) return;
    try {
      const confirmed = await confirm({
        tone: "danger",
        title: "固定資産を削除する",
        body: ["この固定資産を削除します。"],
        confirmLabel: "削除する",
      });
      if (!confirmed) return;
      setDeleting(true);
      setErrorText(null);
      try {
        const ok = await onDelete();
        if (!ok) setErrorText("削除に失敗しました");
      } catch (error) {
        debugAppError(error);
        setErrorText(safeUserErrorMessage(error, "削除に失敗しました"));
      } finally {
        setDeleting(false);
      }
    } finally {
      release();
    }
  };

  return (
    <>
      <FormStyles />

      <DrawerFrame
        label={mode === "create" ? "固定資産の追加" : "固定資産の編集"}
        drawerRef={drawerRef}
        onBackdropClick={requestClose}
      >
        <header
          style={{
            height: sizes.drawer.headerHeight,
            padding: "0 20px",
            background: palette.surface,
            borderBottom: `1px solid ${palette.borderStrong}`,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: palette.text,
            }}
          >
            {mode === "create" ? "固定資産の追加" : "固定資産の編集"}
          </div>
        </header>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px 20px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Field label="名称">
            <FormTextInput
              value={draft.name}
              onChange={(value) => setDraft({ ...draft, name: value })}
              readOnly={false}
              width={null}
              placeholder={null}
            />
          </Field>
          <Field label="勘定科目">
            <FormTextInput
              value={draft.account}
              onChange={(value) => setDraft({ ...draft, account: value })}
              readOnly={false}
              width={null}
              placeholder={null}
            />
          </Field>
          <Field label="取得日">
            <DateInput
              value={draft.acquisitionDate}
              max={periodEndDate}
              onChange={(value) =>
                setDraft({ ...draft, acquisitionDate: value })
              }
              min={null}
            />
          </Field>
          <Field label="取得価額">
            <AmountInput
              value={draft.acquisitionCost}
              onChange={(value) =>
                setDraft({ ...draft, acquisitionCost: value })
              }
              ariaLabel={null}
            />
          </Field>
          <Field label="耐用年数 (年)">
            <UsefulLifeInput
              value={draft.usefulLife}
              onChange={(value) => setDraft({ ...draft, usefulLife: value })}
            />
          </Field>
          <Field label="事業割合 (0-100%)">
            <BusinessRateField
              value={draft.businessRatePercent}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  businessRatePercent: value,
                  businessRate: null,
                })
              }
            />
          </Field>
          {mode === "edit" ? (
            <Field label="状態">
              <StatusField
                value={draft.status}
                onChange={(value) => setDraft({ ...draft, status: value })}
              />
            </Field>
          ) : null}
          {mode === "edit" && needsDisposalDate ? (
            <Field label="処分日">
              <DateInput
                value={draft.disposalDate ?? ""}
                min={laterIsoDate(draft.acquisitionDate, periodStartDate)}
                max={periodEndDate}
                onChange={(value) =>
                  setDraft({ ...draft, disposalDate: value })
                }
              />
            </Field>
          ) : null}
          {mode === "edit" && needsDisposalPrice ? (
            <Field label="売却額">
              <AmountInput
                value={draft.disposalPrice ?? ""}
                onChange={(value) =>
                  setDraft({ ...draft, disposalPrice: value })
                }
                ariaLabel={null}
              />
            </Field>
          ) : null}

          <DepreciationPreview
            period={calculatedPreview.periodLabel}
            remaining={calculatedPreview.remainingLabel}
            progress={calculatedPreview.progress}
            currentBookValue={calculatedPreview.currentBookValue}
            periodDepreciation={calculatedPreview.periodDepreciation}
          />

          {errorText != null ? (
            <div
              style={{
                fontSize: fontSize.sm,
                color: palette.danger,
                fontWeight: fontWeight.semibold,
              }}
            >
              {errorText}
            </div>
          ) : null}
        </div>

        <footer
          style={{
            padding: "16px 20px",
            borderTop: `1px solid ${palette.borderStrong}`,
            background: palette.surface,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {mode === "edit" && onDelete != null ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              style={{
                height: sizes.button.compactHeight,
                minWidth: 86,
                padding: "0 14px",
                borderRadius: radii.sm,
                border: `1px solid ${palette.dangerBorder}`,
                background: palette.dangerBg,
                color: palette.danger,
                fontSize: fontSize.base,
                fontWeight: fontWeight.bold,
                cursor: deleting || saving ? "default" : "pointer",
                opacity: deleting || saving ? 0.5 : 1,
              }}
            >
              {deleting ? "削除中…" : "削除"}
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <FormSecondaryButton
              onClick={requestClose}
              disabled={saving || deleting}
            >
              キャンセル
            </FormSecondaryButton>
            <FormPrimaryButton
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving ? "保存中…" : "保存"}
            </FormPrimaryButton>
          </div>
        </footer>
      </DrawerFrame>
      {dialog}
    </>
  );
}

function laterIsoDate(left: string, right: string): string {
  if (parseIsoLocalDate(left) == null) return right;
  if (parseIsoLocalDate(right) == null) return left;
  return left > right ? left : right;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <span
        style={{
          marginBottom: 8,
          fontSize: fontSize.base,
          fontWeight: fontWeight.semibold,
          color: palette.textLabel,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const controlStyle = {
  height: sizes.field.height,
  boxSizing: "border-box" as const,
  border: `1px solid ${palette.borderStrong}`,
  borderRadius: radii.sm,
  background: palette.surface,
  padding: `0 ${sizes.field.paddingX}`,
  ...typography.input,
  color: palette.text,
  outline: "none",
  fontFamily: "inherit" as const,
};

function DateInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string | null;
  max: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      min={min ?? undefined}
      max={max ?? undefined}
      onChange={(event) => onChange(event.target.value)}
      style={{ ...controlStyle, width: "100%" }}
    />
  );
}

function UsefulLifeInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={1}
      max={MAX_FIXED_ASSET_USEFUL_LIFE_YEARS}
      step={1}
      inputMode="numeric"
      value={Number.isFinite(value) && value > 0 ? value : ""}
      onChange={(event) => {
        const next = parseInt(event.target.value, 10);
        onChange(
          Number.isNaN(next)
            ? 0
            : Math.min(MAX_FIXED_ASSET_USEFUL_LIFE_YEARS, Math.max(0, next)),
        );
      }}
      style={{ ...controlStyle, width: "100%" }}
    />
  );
}

function BusinessRateField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div style={{ fontSize: fontSize.sm, color: palette.textMuted }}>
        {percent}%
      </div>
    </div>
  );
}

function DepreciationPreview({
  period,
  remaining,
  progress,
  currentBookValue,
  periodDepreciation,
}: {
  period: string;
  remaining: string;
  progress: number;
  currentBookValue: number;
  periodDepreciation: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        padding: 16,
        background: palette.surfaceTint,
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: radii.sm,
      }}
    >
      <div
        style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.semibold,
          color: palette.textLabel,
        }}
      >
        償却の自動計算（定額法）
      </div>
      <PreviewRow label="償却期間" value={period || "—"} />
      <PreviewRow
        label="進捗"
        value={`${Math.round(progress * 100)}%（${remaining}）`}
      />
      <PreviewRow
        label="現在簿価"
        value={`${formatAmount(currentBookValue)} 円`}
      />
      <PreviewRow
        label="当期償却費"
        value={`${formatAmount(periodDepreciation)} 円`}
      />
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: fontSize.sm, color: palette.textMuted }}>
        {label}
      </span>
      <span
        style={{
          fontSize: fontSize.sm,
          color: palette.text,
          fontWeight: fontWeight.semibold,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusField({
  value,
  onChange,
}: {
  value: FixedAssetStatus;
  onChange: (value: FixedAssetStatus) => void;
}) {
  const options: FixedAssetStatus[] = ["active", "retired", "sold", "disposed"];
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as FixedAssetStatus)}
      style={controlStyle}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {FIXED_ASSET_STATUS_LABELS[option]}
        </option>
      ))}
    </select>
  );
}
