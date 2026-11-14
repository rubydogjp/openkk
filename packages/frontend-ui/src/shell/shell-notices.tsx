"use client";

import { useEffect, useState } from "react";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkBookFiles,
  useOpenkkBookStorage,
  useOpenkkEntries,
  usePlatformAdapter,
  type OpenkkBookFile,
} from "../bindings/index.js";

import { debugAppError } from "../shared/app-error-text.js";
import { useOpenkkStandingNotice } from "../shared/notices/notices.js";
import { safeUserErrorMessage } from "../shared/safe-error-message.js";

const BOOK_STORAGE_NOTICE_SEEN_KEY = "openkk.book-storage-notice.seen";

const SEEN_VALUE = "1";
const KEPT_IN_BROWSER_MESSAGE = "データはこのブラウザの中だけにあります";
const STORAGE_FAILED_MESSAGE = "ブラウザに保存できませんでした";
const NEVER_SAVED_MESSAGE = "まだバックアップしていません";
const SAVE_OVERDUE_MESSAGE = "30 日、バックアップしていません";
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
          onClose: null,
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
          onClose: null,
        }
      : null,
  );
}

function useKeptInBrowserNotice(hasSession: boolean): void {
  const bookFiles = useOpenkkBookFiles();
  const { storage } = usePlatformAdapter();
  const [seen, setSeen] = useState(
    () => storage.getItem(BOOK_STORAGE_NOTICE_SEEN_KEY) === SEEN_VALUE,
  );
  useOpenkkStandingNotice(
    "book-kept-in-browser",
    hasSession && bookFiles?.saveTracking != null && !seen
      ? {
          tone: "warning",
          message: KEPT_IN_BROWSER_MESSAGE,
          action: null,
          closable: true,
          onClose: () => {
            storage.setItem(BOOK_STORAGE_NOTICE_SEEN_KEY, SEEN_VALUE);
            setSeen(true);
          },
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
          action: { label: "バックアップ", run: onSave },
          closable: true,
          onClose: null,
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
          onClose: null,
        },
  );
}

export function ShellNotices(props: {
  hasSession: boolean;
  bookFile: OpenkkBookFile | null;
  onSave: (() => void) | null;
}) {
  useKeptInBrowserNotice(props.hasSession);
  useBookStorageNotices();
  useBookSaveReminder(props.bookFile, props.onSave);
  useDataLoadNotice();
  return null;
}
