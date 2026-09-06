"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ConfirmDialogResolver } from "./confirm-dialog-resolver.js";
import { useModalLifecycle } from "./dismissible-layer.js";
import { fontSize, fontWeight, palette, radii, shadows, sizes, typography } from "./design-tokens.js";

export type ConfirmDialogTone = "confirm" | "warning" | "danger" | "success";

export type ConfirmDialogOptions = {
  tone: ConfirmDialogTone;
  title: string;
  body: string[];
  confirmLabel?: string;
  cancelLabel?: string;
};

const toneMap = {
  confirm: {
    iconBg: palette.actionBg,
    iconColor: palette.action,
    primaryBg: palette.action,
    Icon: CheckCircleIcon,
  },

  success: {
    iconBg: palette.successBg,
    iconColor: palette.success,
    primaryBg: palette.success,
    Icon: CheckCircleIcon,
  },
  warning: {
    iconBg: palette.warningBg,
    iconColor: palette.warning,
    primaryBg: palette.warning,
    Icon: WarningIcon,
  },
  danger: {
    iconBg: palette.dangerBg,
    iconColor: palette.danger,
    primaryBg: palette.danger,
    Icon: ErrorIcon,
  },
} as const;

function ConfirmDialogView(
  props: ConfirmDialogOptions & { onConfirm: () => void; onCancel: () => void },
) {
  const {
    tone,
    title,
    body,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  } = props;
  const t = toneMap[tone];
  const IconComp = t.Icon;
  const titleId = useId();
  const bodyId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalLifecycle<HTMLDivElement>(
    onCancel,
    cancelButtonRef,
  );

  return (
    <>
      <div
        className="bk-dialog-backdrop"
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.28)",
          zIndex: 9998,
        }}
      />

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <div
          ref={dialogRef}
          className="bk-dialog-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={body.length > 0 ? bodyId : undefined}
          tabIndex={-1}
          style={{
            width: "100%",
            maxWidth: 480,
            background: palette.surface,
            borderRadius: 24,
            padding: "24px 24px 22px",
            boxShadow: shadows.popup,
            pointerEvents: "all",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                background: t.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <IconComp size={26} color={t.iconColor} />
            </div>
            <div
              id={titleId}
              style={{
                fontSize: typography.dialogTitle.fontSize,
                fontWeight: fontWeight.bold,
                color: palette.text,
              }}
            >
              {title}
            </div>
          </div>

          {body.length > 0 && (
            <div
              id={bodyId}
              style={{ marginTop: 16, display: "grid", gap: 6 }}
            >
              {body.map((paragraph, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    fontSize: fontSize.md,
                    lineHeight: 1.65,
                    color: palette.textSoft,
                    fontWeight: fontWeight.medium,
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 22,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              style={cancelStyle}
            >
              {cancelLabel ?? "キャンセル"}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{ ...confirmBaseStyle, background: t.primaryBg }}
            >
              {confirmLabel ?? "実行する"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef(new ConfirmDialogResolver());

  useEffect(
    () => () => {
      resolverRef.current.settle(false);
    },
    [],
  );

  const confirm = (opts: ConfirmDialogOptions): Promise<boolean> =>
    new Promise((resolve) => {
      resolverRef.current.start(resolve);
      setOptions(opts);
    });

  const dismiss = (result: boolean) => {
    resolverRef.current.settle(result);
    setOptions(null);
  };

  const dialog = options ? (
    <ConfirmDialogView
      {...options}
      onConfirm={() => dismiss(true)}
      onCancel={() => dismiss(false)}
    />
  ) : null;

  return { confirm, dialog };
}

const cancelStyle = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: "0 18px",
  borderRadius: radii.sm,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.surface,
  color: palette.textSoft,
  ...typography.control,
  fontWeight: fontWeight.bold,
  cursor: "pointer",
} as const;

const confirmBaseStyle = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formPrimaryMinWidth,
  padding: "0 18px",
  borderRadius: radii.sm,
  border: "none",
  color: palette.surface,
  ...typography.control,
  fontWeight: fontWeight.bold,
  cursor: "pointer",
} as const;

function CheckCircleIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.6" />
      <path
        d="M7.5 12l3.2 3.2 5.8-6.4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="13"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.8" fill={color} />
    </svg>
  );
}

function ErrorIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.6" />
      <line
        x1="12"
        y1="8"
        x2="12"
        y2="13"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.5" r="0.8" fill={color} />
    </svg>
  );
}
