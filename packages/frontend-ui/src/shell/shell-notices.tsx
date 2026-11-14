"use client";

import { useEffect } from "react";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkBookStorage,
  useOpenkkEntries,
  type OpenkkBookFile,
} from "../bindings/index.js";

import { debugAppError } from "../shared/app-error-text.js";
import { useOpenkkStandingNotice } from "../shared/notices/notices.js";
import { safeUserErrorMessage } from "../shared/safe-error-message.js";

const STORAGE_FAILED_MESSAGE = "ブラウザに保存できませんでした";
const NEVER_SAVED_MESSAGE = "まだファイルに保存していません";
const SAVE_OVERDUE_MESSAGE = "30 日、ファイルに保存していません";
const LOAD_FAILED_MESSAGE = "データを読み込めませんでした";

function unreadableBooksMessage(count: number): string {
  return `読み込めない会計期間が ${count} 件あります。ページを読み込み直してください`;
}

function useBookStorageNotices(): void {
  const storage = useOpenkkBookStorage();
  useOpenkkStandingNotice(
    "book-storage-failed",
    storage?.status === "failed"
      ? {
          tone: "danger",
          message: STORAGE_FAILED_MESSAGE,
          action: {
            label: "もう一度",
            run: () => void storage.retry().catch(() => {}),
          },
          closable: false,
        }
      : null,
  );
  const unreadableBookCount = storage?.unreadableBookCount ?? 0;
  useOpenkkStandingNotice(
    "book-unreadable",
    unreadableBookCount > 0
      ? {
          tone: "warning",
          message: unreadableBooksMessage(unreadableBookCount),
          action: null,
          closable: false,
        }
      : null,
  );
}

function useBookSaveReminder(
  bookFile: OpenkkBookFile | null,
  onSave: (() => void) | null,
): void {
  const fiscalPeriodId = useOpenkkAppState().currentFiscalPeriodId;
  useOpenkkStandingNotice(
    `book-save-reminder:${fiscalPeriodId ?? ""}`,
    bookFile?.reminderDue === true && onSave != null
      ? {
          tone: "warning",
          message:
            bookFile.lastSavedAt == null
              ? NEVER_SAVED_MESSAGE
              : SAVE_OVERDUE_MESSAGE,
          action: { label: "保存", run: onSave },
          closable: true,
        }
      : null,
  );
}

function useDataLoadNotice(): void {
  const appState = useOpenkkAppState();
  const entries = useOpenkkEntries();
  const assist = useOpenkkAssist();
  const failedSources = [
    {
      error: appState.fiscalPeriodLoadError,
      reload: appState.reloadFiscalPeriods,
    },
    { error: entries.loadError, reload: entries.reload },
    { error: assist.loadError, reload: assist.reload },
  ].filter((source) => source.error != null);
  const firstError = failedSources[0]?.error ?? null;

  useEffect(() => {
    if (firstError != null) debugAppError(firstError);
  }, [firstError]);

  useOpenkkStandingNotice(
    "data-load-failed",
    firstError == null
      ? null
      : {
          tone: "danger",
          message: safeUserErrorMessage(firstError, LOAD_FAILED_MESSAGE),
          action: {
            label: "再読み込み",
            run: () => {
              for (const source of failedSources) source.reload();
            },
          },
          closable: false,
        },
  );
}

export function ShellNotices(props: {
  bookFile: OpenkkBookFile | null;
  onSave: (() => void) | null;
}) {
  useBookStorageNotices();
  useBookSaveReminder(props.bookFile, props.onSave);
  useDataLoadNotice();
  return null;
}
