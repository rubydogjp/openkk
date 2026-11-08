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
import { useConfirmDialog } from "../shared/confirm-dialog.js";
import { CloseIcon, FolderOpenIcon, PlusIcon } from "../shared/icons.js";
import {
  useReportWorkInProgress,
  WorkInProgressProvider,
} from "../shared/work-in-progress.js";

export type DocumentStartRecentFile = {
  id: string;
  name: string;
};

export type DocumentStartBook = {
  name: string;
  lastModified: number;
};

export type DocumentStartPlace =
  | { kind: "no_folder" }
  | { kind: "folder_needs_access"; folderName: string }
  | { kind: "folder"; folderName: string }
  | { kind: "in_app" }
  | { kind: "download" };

type DocumentStartScreenProps = {
  title: string;
  place: DocumentStartPlace;
  books: DocumentStartBook[];
  recentFiles: DocumentStartRecentFile[];
  busy: boolean;
  errorMessage: string | null;
  onChooseFolder: () => void;
  onRequestFolderAccess: () => void;
  onCreate: () => void;
  onOpen: () => void;
  onOpenBook: (name: string) => void;
  onRemoveBook: (name: string) => void;
  onOpenRecent: (id: string) => void;
  onForgetRecent: (id: string) => void;
};

const FOLDER_DESCRIPTION =
  "帳簿は、選んだフォルダに期間ごとのファイル (.openkk) として保存します。コピーやバックアップも、ふつうのファイルと同じようにできます。";

const PLACE_DESCRIPTIONS: Record<DocumentStartPlace["kind"], string> = {
  no_folder: FOLDER_DESCRIPTION,
  folder_needs_access: FOLDER_DESCRIPTION,
  folder: FOLDER_DESCRIPTION,
  in_app:
    "このブラウザでは、帳簿のファイル (.openkk) をアプリの中に保存します。変更するたびに自動で保存されます。",
  download:
    "帳簿を 1 つのファイル (.openkk) に保存します。ファイルはパソコンの好きな場所に置けて、コピーやバックアップもふつうのファイルと同じようにできます。",
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
  const { confirm, dialog } = useConfirmDialog();
  const { place } = props;

  async function handleRemoveBook(name: string) {
    const confirmed = await confirm({
      tone: "danger",
      title: `${name} を削除しますか？`,
      body: ["アプリの中から帳簿のファイルを消します。元には戻せません。"],
      confirmLabel: "削除する",
    });
    if (confirmed) props.onRemoveBook(name);
  }

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
      {dialog}
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
            {PLACE_DESCRIPTIONS[place.kind]}
          </p>
        </header>

        {place.kind === "download" ? (
          <Notice tone="warning">
            このブラウザでは、開いたファイルへ直接保存できません。変更はダウンロードして保存します。Chrome
            か Edge なら、変更するたびに自動で保存されます。
          </Notice>
        ) : null}

        {place.kind === "folder_needs_access" ? (
          <Notice tone="warning">
            {`フォルダ「${place.folderName}」の帳簿を開くには、もう一度アクセスを許可してください。`}
          </Notice>
        ) : null}

        {props.errorMessage != null ? (
          <Notice tone="danger">{props.errorMessage}</Notice>
        ) : null}

        {place.kind === "folder" ? (
          <FolderLine
            folderName={place.folderName}
            busy={props.busy}
            onChooseFolder={props.onChooseFolder}
          />
        ) : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {place.kind === "no_folder" ? (
            <ActionButton
              primary
              disabled={props.busy}
              onClick={props.onChooseFolder}
              icon={<FolderOpenIcon size={16} color={palette.surface} />}
            >
              帳簿を置くフォルダを選ぶ
            </ActionButton>
          ) : place.kind === "folder_needs_access" ? (
            <>
              <ActionButton
                primary
                disabled={props.busy}
                onClick={props.onRequestFolderAccess}
                icon={<FolderOpenIcon size={16} color={palette.surface} />}
              >
                アクセスを許可する
              </ActionButton>
              <ActionButton
                primary={false}
                disabled={props.busy}
                onClick={props.onChooseFolder}
                icon={<FolderOpenIcon size={16} color={palette.text} />}
              >
                フォルダを選び直す
              </ActionButton>
            </>
          ) : (
            <>
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
                {place.kind === "in_app"
                  ? "ファイルを取り込む"
                  : "ファイルを開く"}
              </ActionButton>
            </>
          )}
        </div>

        {place.kind === "folder" || place.kind === "in_app" ? (
          <FileList
            label="帳簿"
            emptyMessage="まだ帳簿はありません。「新しい帳簿を作る」から始めてください。"
            busy={props.busy}
            items={props.books.map((book) => ({
              key: book.name,
              name: book.name,
              detail: `${formatLastModified(book.lastModified)} 更新`,
              onOpen: () => props.onOpenBook(book.name),
              remove:
                place.kind === "in_app"
                  ? {
                      label: `${book.name} を削除`,
                      onClick: () => void handleRemoveBook(book.name),
                    }
                  : null,
            }))}
          />
        ) : null}

        {props.recentFiles.length > 0 ? (
          <FileList
            label="最近使ったファイル"
            emptyMessage={null}
            busy={props.busy}
            items={props.recentFiles.map((file) => ({
              key: file.id,
              name: file.name,
              detail: null,
              onOpen: () => props.onOpenRecent(file.id),
              remove: {
                label: `${file.name} を一覧から外す`,
                onClick: () => props.onForgetRecent(file.id),
              },
            }))}
          />
        ) : null}
      </div>
    </main>
  );
}

function formatLastModified(lastModified: number): string {
  const date = new Date(lastModified);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function FolderLine(props: {
  folderName: string;
  busy: boolean;
  onChooseFolder: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing.s8,
        fontSize: fontSize.sm,
        color: palette.textSoft,
      }}
    >
      <FolderOpenIcon size={14} color={palette.textSoft} />
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {`フォルダ: ${props.folderName}`}
      </span>
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onChooseFolder}
        style={{
          flexShrink: 0,
          padding: 0,
          border: "none",
          background: "transparent",
          color: palette.action,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          cursor: props.busy ? "default" : "pointer",
        }}
      >
        フォルダを変える
      </button>
    </div>
  );
}

type FileListItem = {
  key: string;
  name: string;
  detail: string | null;
  onOpen: () => void;
  remove: { label: string; onClick: () => void } | null;
};

function FileList(props: {
  label: string;
  emptyMessage: string | null;
  busy: boolean;
  items: FileListItem[];
}) {
  return (
    <section aria-label={props.label}>
      <h2
        style={{
          margin: "8px 0 8px",
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          color: palette.textSoft,
        }}
      >
        {props.label}
      </h2>
      {props.items.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: fontSize.sm,
            color: palette.textLabel,
            lineHeight: 1.7,
          }}
        >
          {props.emptyMessage}
        </p>
      ) : (
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
          {props.items.map((item, index) => (
            <li
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                borderTop:
                  index === 0 ? "none" : `1px solid ${palette.borderSubtle}`,
              }}
            >
              <button
                type="button"
                disabled={props.busy}
                onClick={item.onOpen}
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
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.name}
                </span>
                {item.detail != null ? (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: fontSize.sm,
                      color: palette.textLabel,
                    }}
                  >
                    {item.detail}
                  </span>
                ) : null}
              </button>
              {item.remove != null ? (
                <button
                  type="button"
                  aria-label={item.remove.label}
                  disabled={props.busy}
                  onClick={item.remove.onClick}
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
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
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
