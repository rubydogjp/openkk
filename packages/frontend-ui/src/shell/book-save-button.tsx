"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import {
  useOpenkkBookFile,
  useOpenkkToday,
  type OpenkkBookFile,
} from "../bindings/index.js";
import type { FiscalPeriod } from "@rubydogjp/openkk-driver";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import { DownloadIcon } from "../shared/icons.js";
import { bookSaveStatusLabel } from "./book-save-date.js";
import { SHELL_PALETTE } from "./shell-palette.js";

const SAVE_FAILED_MESSAGE = "バックアップできませんでした";

type BookSave = {
  bookFile: OpenkkBookFile;
  saving: boolean;
  failed: boolean;
  save: () => void;
};

export function useShellBookSave(
  fiscalPeriod: FiscalPeriod | null,
): BookSave | null {
  const bookFile = useOpenkkBookFile(fiscalPeriod);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (bookFile == null) return null;
  return {
    bookFile,
    saving,
    failed,
    save() {
      if (saving) return;
      setSaving(true);
      setFailed(false);
      void bookFile
        .save()
        .catch((error: unknown) => {
          console.error("[openkk] book save failed:", error);
          setFailed(true);
        })
        .finally(() => setSaving(false));
    },
  };
}

const SIDEBAR_SAVE_BUTTON_HEIGHT = 30;
const BACKUP_ICON_SIZE = 16;
const COMPACT_STATUS_LINE_HEIGHT = 1.25;
const COMPACT_STATUS_MAX_LINES = 2;

const SIDEBAR_BACKUP_STATUS_HEIGHT = 14;
const BACKUP_BUTTON_LABEL = "バックアップ";
const SAVING_BACKUP_BUTTON_OPACITY = 0.62;
const UNAVAILABLE_BACKUP_BUTTON_OPACITY = 0.38;

function backupButtonStyle(input: {
  compact: boolean;
  pressable: boolean;
  opacity: number;
}): CSSProperties {
  return {
    height: input.compact
      ? sizes.button.compactHeight
      : SIDEBAR_SAVE_BUTTON_HEIGHT,
    padding: input.compact ? "0 14px" : "0 14px 0 12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s6,
    borderRadius: radii.sm,
    border: "none",
    background: palette.action,
    color: palette.surface,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    cursor: input.pressable ? "pointer" : "default",
    opacity: input.opacity,
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
}

function BackupButtonContent() {
  return (
    <>
      <DownloadIcon size={BACKUP_ICON_SIZE} color="currentColor" />
      <span className="bk-button-label">{BACKUP_BUTTON_LABEL}</span>
    </>
  );
}

function SaveButton(props: { bookSave: BookSave; compact: boolean }) {
  const { bookSave, compact } = props;
  return (
    <button
      type="button"
      className={compact ? "bk-narrow-icon-only" : ""}
      onClick={bookSave.save}
      disabled={bookSave.saving}
      aria-label={BACKUP_BUTTON_LABEL}
      title={`${bookSave.bookFile.fileName} にバックアップ`}
      style={backupButtonStyle({
        compact,
        pressable: !bookSave.saving,
        opacity: bookSave.saving ? SAVING_BACKUP_BUTTON_OPACITY : 1,
      })}
    >
      <BackupButtonContent />
    </button>
  );
}

function UnavailableSidebarBackupButton() {
  return (
    <button
      type="button"
      disabled
      aria-label={BACKUP_BUTTON_LABEL}
      style={backupButtonStyle({
        compact: false,
        pressable: false,
        opacity: UNAVAILABLE_BACKUP_BUTTON_OPACITY,
      })}
    >
      <BackupButtonContent />
    </button>
  );
}

function useSaveStatusLabel(bookSave: BookSave): string {
  const today = useOpenkkToday();
  return bookSave.failed
    ? SAVE_FAILED_MESSAGE
    : bookSaveStatusLabel(bookSave.bookFile, today.getTime());
}

function SidebarBackupRow(props: {
  button: ReactNode;
  status: string;
  failed: boolean;
}) {
  return (
    <div
      style={{
        padding: "2px 4px 5px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 5,
      }}
    >
      {props.button}
      <div
        role="status"
        style={{
          height: SIDEBAR_BACKUP_STATUS_HEIGHT,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          color: props.failed ? palette.danger : SHELL_PALETTE.subtitleColor,
          lineHeight: `${SIDEBAR_BACKUP_STATUS_HEIGHT}px`,
          whiteSpace: "nowrap",
        }}
      >
        {props.status}
      </div>
    </div>
  );
}

function AvailableSidebarBackup(props: { bookSave: BookSave }) {
  const { bookSave } = props;
  return (
    <SidebarBackupRow
      button={<SaveButton bookSave={bookSave} compact={false} />}
      status={useSaveStatusLabel(bookSave)}
      failed={bookSave.failed}
    />
  );
}

export function ShellBookSave(props: { bookSave: BookSave | null }) {
  return props.bookSave == null ? (
    <SidebarBackupRow
      button={<UnavailableSidebarBackupButton />}
      status=""
      failed={false}
    />
  ) : (
    <AvailableSidebarBackup bookSave={props.bookSave} />
  );
}

export function ShellBookSaveCompact(props: { bookSave: BookSave }) {
  const { bookSave } = props;
  const label = useSaveStatusLabel(bookSave);
  return (
    <div
      style={{
        marginLeft: "auto",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        className="bk-backup-status-compact"
        style={{
          minWidth: 0,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          color: bookSave.failed ? palette.danger : palette.textLabel,
          lineHeight: COMPACT_STATUS_LINE_HEIGHT,
          maxHeight: `${COMPACT_STATUS_MAX_LINES * COMPACT_STATUS_LINE_HEIGHT}em`,
          overflow: "hidden",
          textAlign: "right",
        }}
      >
        {label}
      </span>
      <SaveButton bookSave={bookSave} compact />
    </div>
  );
}
