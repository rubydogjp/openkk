"use client";

import type { ReactNode } from "react";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import { CloseIcon, FolderOpenIcon, PlusIcon } from "../shared/icons.js";
import {
  useReportWorkInProgress,
  WorkInProgressProvider,
} from "../shared/work-in-progress.js";

export type DocumentStartRecentFile = {
  id: string;
  name: string;
};

type DocumentStartScreenProps = {
  title: string;
  canSaveDirectly: boolean;
  recentFiles: DocumentStartRecentFile[];
  busy: boolean;
  errorMessage: string | null;
  onCreate: () => void;
  onOpen: () => void;
  onOpenRecent: (id: string) => void;
  onForgetRecent: (id: string) => void;
};

export function DocumentStartScreen(props: DocumentStartScreenProps) {
  return (
    <WorkInProgressProvider>
      <DocumentStartContent {...props} />
    </WorkInProgressProvider>
  );
}

function DocumentStartContent(props: DocumentStartScreenProps) {
  useReportWorkInProgress(props.busy);
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "72px 16px",
        background: palette.formGroupBg,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <header>
          <h1
            style={{
              margin: 0,
              fontSize: fontSize.xl,
              fontWeight: fontWeight.bold,
              color: palette.text,
            }}
          >
            {props.title}
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: fontSize.base,
              color: palette.textSoft,
              lineHeight: 1.7,
            }}
          >
            帳簿を 1 つのファイル (.openkk)
            に保存します。ファイルはパソコンの好きな場所に置けて、コピーやバックアップもふつうのファイルと同じようにできます。
          </p>
        </header>

        {!props.canSaveDirectly ? (
          <Notice tone="warning">
            このブラウザでは、開いたファイルへ直接保存できません。変更はダウンロードして保存します。Chrome
            か Edge なら、変更するたびに自動で保存されます。
          </Notice>
        ) : null}

        {props.errorMessage != null ? (
          <Notice tone="danger">{props.errorMessage}</Notice>
        ) : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ActionButton
            primary
            disabled={props.busy}
            onClick={props.onCreate}
            icon={<PlusIcon size={16} color={palette.surface} />}
          >
            新しい帳簿を作る
          </ActionButton>
          <ActionButton
            primary={false}
            disabled={props.busy}
            onClick={props.onOpen}
            icon={<FolderOpenIcon size={16} color={palette.text} />}
          >
            ファイルを開く
          </ActionButton>
        </div>

        {props.recentFiles.length > 0 ? (
          <section aria-label="最近使ったファイル">
            <h2
              style={{
                margin: "8px 0 8px",
                fontSize: fontSize.sm,
                fontWeight: fontWeight.bold,
                color: palette.textSoft,
              }}
            >
              最近使ったファイル
            </h2>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                background: palette.surface,
                border: `1px solid ${palette.borderSubtle}`,
                borderRadius: radii.md,
                overflow: "hidden",
              }}
            >
              {props.recentFiles.map((file, index) => (
                <li
                  key={file.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderTop:
                      index === 0
                        ? "none"
                        : `1px solid ${palette.borderSubtle}`,
                  }}
                >
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onOpenRecent(file.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: spacing.s8,
                      padding: "12px 14px",
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: props.busy ? "default" : "pointer",
                      fontSize: fontSize.base,
                      color: palette.text,
                    }}
                  >
                    <FolderOpenIcon size={16} color={palette.textSoft} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${file.name} を一覧から外す`}
                    disabled={props.busy}
                    onClick={() => props.onForgetRecent(file.id)}
                    style={{
                      flexShrink: 0,
                      padding: "12px 14px",
                      border: "none",
                      background: "transparent",
                      cursor: props.busy ? "default" : "pointer",
                    }}
                  >
                    <CloseIcon size={14} color={palette.textMuted} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Notice(props: { tone: "warning" | "danger"; children: string }) {
  const danger = props.tone === "danger";
  return (
    <div
      role={danger ? "alert" : "note"}
      style={{
        padding: "10px 14px",
        borderRadius: radii.sm,
        background: danger ? palette.dangerBg : palette.warningBg,
        border: `1px solid ${danger ? palette.dangerBorder : palette.warningBorder}`,
        fontSize: fontSize.sm,
        color: palette.text,
        lineHeight: 1.7,
      }}
    >
      {props.children}
    </div>
  );
}

function ActionButton(props: {
  primary: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s8,
        height: sizes.button.ctaHeight,
        padding: "0 18px",
        borderRadius: radii.sm,
        border: props.primary ? "none" : `1px solid ${palette.borderStrong}`,
        background: props.primary ? palette.brand : palette.surface,
        color: props.primary ? palette.surface : palette.text,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        boxShadow: props.primary ? shadows.primaryButton : "none",
      }}
    >
      {props.icon}
      <span>{props.children}</span>
    </button>
  );
}
