"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ConfirmDialogResolver } from "./confirm-dialog-resolver.js";
import { useModalLifecycle } from "./dismissible-layer.js";
import { CheckCircleIcon, ErrorIcon } from "./icons.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  typography,
} from "./design-tokens.js";

export type ConfirmDialogTone = "danger" | "success";

export type ConfirmDialogOptions = {
  tone: ConfirmDialogTone;
  title: string;
  body: string[];
  confirmLabel: string;
};

const toneMap = {
  success: {
    iconBg: palette.successBg,
    iconColor: palette.success,
    primaryBg: palette.success,
    Icon: CheckCircleIcon,
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
  const { tone, title, body, confirmLabel, onConfirm, onCancel } = props;
  const toneStyle = toneMap[tone];
  const ToneIcon = toneStyle.Icon;
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
                background: toneStyle.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ToneIcon size={26} color={toneStyle.iconColor} />
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
            <div id={bodyId} style={{ marginTop: 16, display: "grid", gap: 6 }}>
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
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{ ...confirmBaseStyle, background: toneStyle.primaryBg }}
            >
              {confirmLabel}
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

  const confirm = (dialogOptions: ConfirmDialogOptions): Promise<boolean> =>
    new Promise((resolve) => {
      resolverRef.current.start(resolve);
      setOptions(dialogOptions);
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
