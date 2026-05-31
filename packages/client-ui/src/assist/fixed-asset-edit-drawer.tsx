"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AmountInput } from "../shared/amount-field";
import { DemoLockButton } from "../shared/demo-icon";
import { fontSize, fontWeight, palette, radii, shadows, sizes, typography } from "../shared/design-tokens";
import {
  FormStyles,
  FormPrimaryButton,
  FormSecondaryButton,
  FormTextInput,
} from "../shared/form-fields";
import { useOpenkkConfig } from "@rubydogjp/openkk-client-usecases";
import {
  computeStraightLineDepreciation,
  parseAmount,
  type FixedAssetDraft,
  type FixedAssetPreviewItem,
} from "@rubydogjp/openkk-client-domain";

export function FixedAssetEditDrawer({
  asset,
  isDemo,
  onClose,
  onSave,
}: {
  asset: FixedAssetPreviewItem;
  isDemo: boolean;
  onClose: () => void;
  onSave: (draft: FixedAssetDraft) => Promise<boolean>;
}) {
  const config = useOpenkkConfig();
  const [draft, setDraft] = useState<FixedAssetDraft>(() => ({
    name: asset.name,
    account: asset.account,
    acquisitionDate: asset.acquisitionDate ?? "",
    acquisitionCost: asset.purchase,
    usefulLife: asset.usefulLife ?? 0,
    businessRatePercent: Math.round((asset.businessRate ?? 1) * 100),
    status: asset.status,
  }));
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // 簿価・進捗・残期間・当期償却費は入力値からリアルタイムに計算して表示する
  // （ユーザーは直接編集しない）。
  const preview = useMemo(
    () =>
      computeStraightLineDepreciation({
        acquisitionDate: draft.acquisitionDate,
        acquisitionCost: parseAmount(draft.acquisitionCost),
        usefulLife: draft.usefulLife,
        asOf: config.today,
      }),
    [draft.acquisitionDate, draft.acquisitionCost, draft.usefulLife, config.today],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (!ok) setErrorText("保存に失敗しました");
      else onClose();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormStyles />

      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.32)",
          zIndex: 9998,
        }}
      />

      <aside
        role="dialog"
        aria-label="固定資産の編集"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: sizes.drawer.width,
          maxWidth: "100vw",
          height: "100vh",
          background: palette.surface,
          zIndex: 9999,
          boxShadow: shadows.drawer,
          display: "flex",
          flexDirection: "column",
          animation: "bk-drawer-slide-in 220ms cubic-bezier(0.2, 0, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes bk-drawer-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

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
            style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: palette.text }}
          >
            固定資産の編集
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
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
          </Field>
          <Field label="勘定科目">
            <FormTextInput
              value={draft.account}
              onChange={(v) => setDraft({ ...draft, account: v })}
            />
          </Field>
          <Field label="取得日">
            <DateInput
              value={draft.acquisitionDate}
              onChange={(v) => setDraft({ ...draft, acquisitionDate: v })}
            />
          </Field>
          <Field label="取得価額">
            <AmountInput
              value={draft.acquisitionCost}
              onChange={(v) => setDraft({ ...draft, acquisitionCost: v })}
            />
          </Field>
          <Field label="耐用年数 (年)">
            <UsefulLifeInput
              value={draft.usefulLife}
              onChange={(v) => setDraft({ ...draft, usefulLife: v })}
            />
          </Field>
          <Field label="事業割合 (0-100%)">
            <BusinessRateField
              value={draft.businessRatePercent}
              onChange={(v) => setDraft({ ...draft, businessRatePercent: v })}
            />
          </Field>
          <Field label="状態">
            <StatusField
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
            />
          </Field>

          <DepreciationPreview
            period={preview.periodLabel}
            remaining={preview.remainingLabel}
            progress={preview.progress}
            currentBookValue={preview.currentBookValue}
            annualDepreciation={preview.annualDepreciation}
          />

          {errorText != null ? (
            <div style={{ fontSize: fontSize.sm, color: palette.danger, fontWeight: fontWeight.semibold }}>
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
            justifyContent: "flex-end",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <FormSecondaryButton onClick={onClose}>
            キャンセル
          </FormSecondaryButton>
          {isDemo ? (
            <DemoLockButton label="保存" />
          ) : (
            <FormPrimaryButton onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </FormPrimaryButton>
          )}
        </footer>
      </aside>
    </>
  );
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
  padding: `0 ${sizes.field.paddingX}px`,
  ...typography.input,
  color: palette.text,
  outline: "none",
  fontFamily: "inherit" as const,
};

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
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
      max={100}
      step={1}
      inputMode="numeric"
      value={Number.isFinite(value) && value > 0 ? value : ""}
      onChange={(event) => {
        const next = parseInt(event.target.value, 10);
        onChange(Number.isNaN(next) ? 0 : Math.max(0, next));
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
      <div style={{ fontSize: fontSize.sm, color: palette.textMuted }}>{percent}%</div>
    </div>
  );
}

function DepreciationPreview({
  period,
  remaining,
  progress,
  currentBookValue,
  annualDepreciation,
}: {
  period: string;
  remaining: string;
  progress: number;
  currentBookValue: number;
  annualDepreciation: number;
}) {
  const yen = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
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
      <PreviewRow label="進捗" value={`${Math.round(progress * 100)}%（${remaining}）`} />
      <PreviewRow label="現在簿価" value={`${yen(currentBookValue)} 円`} />
      <PreviewRow label="当期償却費" value={`${yen(annualDepreciation)} 円`} />
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: fontSize.sm, color: palette.textMuted }}>{label}</span>
      <span style={{ fontSize: fontSize.sm, color: palette.text, fontWeight: fontWeight.semibold }}>
        {value}
      </span>
    </div>
  );
}

function StatusField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = ["償却中", "完了", "売却済", "廃棄済"];
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        height: sizes.field.height,
        boxSizing: "border-box",
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: radii.sm,
        background: palette.surface,
        padding: `0 ${sizes.field.paddingX}px`,
        ...typography.input,
        color: palette.text,
        outline: "none",
        fontFamily: "inherit",
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
