"use client";

import {
  useOpenkkDocument,
  type OpenkkDocumentState,
} from "@rubydogjp/openkk-client-usecases";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
} from "../shared/design-tokens.js";

export const DOCUMENT_STATUS_LABELS: Record<
  OpenkkDocumentState["status"],
  string
> = {
  saved: "保存済み",
  saving: "保存中…",
  unsaved: "未保存",
  conflict: "保存を止めています",
  failed: "保存できませんでした",
};

export function DocumentStatusBanner() {
  const document = useOpenkkDocument();
  if (document == null) return null;
  const notice =
    document.status === "conflict"
      ? {
          tone: "danger" as const,
          message:
            "ほかのアプリやタブでこの帳簿が変更されたため、自動保存を止めました。最新の内容で開き直してください。",
          actionLabel: "開き直す",
          action: document.close,
        }
      : document.status === "failed"
        ? {
            tone: "danger" as const,
            message:
              "ファイルに保存できませんでした。ファイルの場所や書き込みの許可を確かめてください。",
            actionLabel: "もう一度保存",
            action: document.save,
          }
        : document.status === "unsaved"
          ? {
              tone: "warning" as const,
              message:
                "このブラウザではファイルへ直接保存できません。変更はダウンロードして保存してください。",
              actionLabel: "ダウンロードして保存",
              action: document.save,
            }
          : document.backup?.due === true
            ? {
                tone: "info" as const,
                message:
                  document.backup.lastSavedAt == null
                    ? "この帳簿のバックアップをまだ保存していません。アプリの中の帳簿は、ブラウザのデータを消すと失われます。"
                    : "前にバックアップを保存してから 30 日以上たちました。",
                actionLabel: "バックアップを保存",
                action: document.backup.save,
              }
            : null;
  if (notice == null) return null;
  const tones = {
    danger: {
      color: palette.danger,
      background: palette.dangerBg,
      border: palette.dangerBorder,
    },
    warning: {
      color: palette.warning,
      background: palette.warningBg,
      border: palette.warningBorder,
    },
    info: {
      color: palette.action,
      background: palette.actionBg,
      border: palette.actionBorder,
    },
  };
  const tone = tones[notice.tone];
  return (
    <div
      role={notice.tone === "info" ? "status" : "alert"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: tone.background,
        borderBottom: `1px solid ${tone.border}`,
      }}
    >
      <div
        style={{
          flex: 1,
          fontSize: fontSize.sm,
          color: palette.text,
          lineHeight: 1.6,
        }}
      >
        {notice.message}
      </div>
      <button
        type="button"
        onClick={() => void notice.action()}
        style={{
          flexShrink: 0,
          padding: "6px 14px",
          borderRadius: radii.sm,
          border: `1px solid ${tone.color}`,
          background: palette.surface,
          color: tone.color,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          cursor: "pointer",
        }}
      >
        {notice.actionLabel}
      </button>
    </div>
  );
}
