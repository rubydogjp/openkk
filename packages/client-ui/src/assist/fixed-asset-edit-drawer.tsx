"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AmountInput } from "../shared/amount-field";
import { DemoLockButton } from "../shared/demo-icon";
import { fontSize, fontWeight, palette, radii, shadows, sizes, typography } from "../shared/design-tokens";
import {
  FormStyles,
  FormPrimaryButton,
  FormSecondaryButton,
  FormTextInput,
} from "../shared/form-fields";
import type {
  FixedAssetDraft,
  FixedAssetPreviewItem,
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
  const [draft, setDraft] = useState<FixedAssetDraft>(() => ({
    name: asset.name,
    account: asset.account,
    period: asset.period,
    remaining: asset.remaining,
    progress: asset.progress,
    current: asset.current,
    purchase: asset.purchase,
    status: asset.status,
  }));
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

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
          <Field label="期間表示">
            <FormTextInput
              value={draft.period}
              onChange={(v) => setDraft({ ...draft, period: v })}
            />
          </Field>
          <Field label="残り期間表示">
            <FormTextInput
              value={draft.remaining}
              onChange={(v) => setDraft({ ...draft, remaining: v })}
            />
          </Field>
          <Field label="現在簿価">
            <AmountInput
              value={draft.current}
              onChange={(v) => setDraft({ ...draft, current: v })}
            />
          </Field>
          <Field label="取得価額">
            <AmountInput
              value={draft.purchase}
              onChange={(v) => setDraft({ ...draft, purchase: v })}
            />
          </Field>
          <Field label="進捗 (0-100%)">
            <ProgressField
              value={draft.progress}
              onChange={(v) => setDraft({ ...draft, progress: v })}
            />
          </Field>
          <Field label="状態">
            <StatusField
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
            />
          </Field>

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

function ProgressField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <div style={{ fontSize: fontSize.sm, color: palette.textMuted }}>{percent}%</div>
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
