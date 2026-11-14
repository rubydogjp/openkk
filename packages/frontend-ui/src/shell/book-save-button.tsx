"use client";

import { useState } from "react";

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
import { SaveIcon } from "../shared/icons.js";
import { bookSaveStatusLabel } from "./book-save-date.js";
import { SHELL_PALETTE } from "./shell-palette.js";

const SAVE_FAILED_MESSAGE = "保存できませんでした";

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
const SAVE_ICON_SIZE = 16;

function SaveButton(props: { bookSave: BookSave; compact: boolean }) {
  const { bookSave, compact } = props;
  return (
    <button
      type="button"
      className={compact ? "bk-narrow-icon-only" : ""}
      onClick={bookSave.save}
      disabled={bookSave.saving}
      aria-label="ファイルに保存"
      title={`${bookSave.bookFile.fileName} として保存`}
      style={{
        height: compact
          ? sizes.button.compactHeight
          : SIDEBAR_SAVE_BUTTON_HEIGHT,
        padding: compact ? "0 14px" : "0 14px 0 12px",
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
        cursor: bookSave.saving ? "default" : "pointer",
        opacity: bookSave.saving ? 0.62 : 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <SaveIcon size={SAVE_ICON_SIZE} color="currentColor" />
      <span className="bk-button-label">保存</span>
    </button>
  );
}

function useSaveStatusLabel(bookSave: BookSave): string {
  const today = useOpenkkToday();
  return bookSave.failed
    ? SAVE_FAILED_MESSAGE
    : bookSaveStatusLabel(bookSave.bookFile, today.getTime());
}

export function ShellBookSave(props: { bookSave: BookSave }) {
  const { bookSave } = props;
  const label = useSaveStatusLabel(bookSave);
  return (
    <>
      <SaveButton bookSave={bookSave} compact={false} />
      <div
        role="status"
        style={{
          flex: "0 0 100%",
          minHeight: 14,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          color: bookSave.failed ? palette.danger : SHELL_PALETTE.subtitleColor,
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </>
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
        style={{
          minWidth: 0,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          color: bookSave.failed ? palette.danger : palette.textLabel,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      <SaveButton bookSave={bookSave} compact />
    </div>
  );
}
