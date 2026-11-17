"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  AppError,
  type OpenkkFiscalPeriodLabel,
} from "@rubydogjp/openkk-driver";

import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkBookFiles,
  useOpenkkEntries,
  useOpenkkLegacyBookChanges,
  usePlatformAdapter,
} from "../bindings/index.js";
import { useConfirmDialog } from "../shared/confirm-dialog.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import {
  useOpenkkNotices,
  useOpenkkStandingNotice,
} from "../shared/notices/notices.js";

const LEGACY_REMOVED_NOTICE_SEEN_KEY =
  "openkk.legacy-removed-fiscal-periods-notice.seen";
const MOVE_FAILED_MESSAGE = "前の版のデータを移せませんでした";
const PATH_AFTER_MOVE = "/steps";

function onlyName(periods: readonly OpenkkFiscalPeriodLabel[]): string | null {
  const [first] = periods;
  return periods.length === 1 && first?.name != null ? first.name : null;
}

export function legacyChangedFiscalPeriodsMessage(
  periods: readonly OpenkkFiscalPeriodLabel[],
): string {
  const name = onlyName(periods);
  return name != null
    ? `前の版で「${name}」が変わっています`
    : `前の版で ${periods.length} 件の会計期間が変わっています`;
}

export function legacyRemovedFiscalPeriodsMessage(
  periods: readonly OpenkkFiscalPeriodLabel[],
): string {
  const name = onlyName(periods);
  return name != null
    ? `前の版で「${name}」が消えています。こちらは消していません`
    : `前の版で ${periods.length} 件の会計期間が消えています。こちらは消していません`;
}

export function legacyOverwriteMessage(
  periods: readonly OpenkkFiscalPeriodLabel[],
): string {
  const name = onlyName(periods);
  const target =
    name != null ? `「${name}」` : ` ${periods.length} 件の会計期間`;
  return `アプリの中の${target}に、移したあとで入れた変更があります。前の版を優先して上書きすると失われます。`;
}

export function useLegacyBookChangesNotice(hasSession: boolean): ReactNode {
  const changes = useOpenkkLegacyBookChanges();
  const saveTracking = useOpenkkBookFiles()?.saveTracking ?? null;
  const appState = useOpenkkAppState();
  const entries = useOpenkkEntries();
  const assist = useOpenkkAssist();
  const platform = usePlatformAdapter();
  const notices = useOpenkkNotices();
  const { confirm, dialog } = useConfirmDialog();
  const moveLock = useRef(new ExclusiveActionLock());
  const [changedClosed, setChangedClosed] = useState(false);
  const removedKey = JSON.stringify(changes?.removedFiscalPeriods ?? []);
  const [removedSeen, setRemovedSeen] = useState(() =>
    platform.storage.getItem(LEGACY_REMOVED_NOTICE_SEEN_KEY),
  );

  const moveChanges = async () => {
    if (saveTracking == null) return;
    const release = moveLock.current.tryAcquire();
    if (release == null) return;
    try {
      const overwriting = saveTracking.legacyChangesOverwritingApp();
      if (overwriting.length > 0) {
        const confirmed = await confirm({
          tone: "danger",
          title: "前の版での上書き",
          body: [legacyOverwriteMessage(overwriting)],
          confirmLabel: "上書きする",
        });
        if (!confirmed) return;
      }
      const moved = await saveTracking.moveLegacyBookChanges();
      if (moved.allBooksStored) {
        platform.navigation.reloadAt(PATH_AFTER_MOVE);
        return;
      }
      appState.reloadFiscalPeriods();
      entries.reload();
      assist.reload();
    } catch (error) {
      notices.show({
        tone: "danger",
        message: AppError.from(error, {
          fallbackUserMessage: MOVE_FAILED_MESSAGE,
          fallbackDeveloperMessage: "legacy: move the previous version failed",
          statusCode: null,
        }).messageForUser,
      });
    } finally {
      release();
    }
  };

  const changed = changes?.changedFiscalPeriods ?? [];
  useOpenkkStandingNotice(
    "legacy-changed-fiscal-periods",
    hasSession && changed.length > 0 && !changedClosed
      ? {
          tone: "warning",
          message: legacyChangedFiscalPeriodsMessage(changed),
          action: { label: "移し直す", run: () => void moveChanges() },
          closable: true,
          onClose: () => setChangedClosed(true),
        }
      : null,
  );

  const removed = changes?.removedFiscalPeriods ?? [];
  useOpenkkStandingNotice(
    "legacy-removed-fiscal-periods",
    hasSession && removed.length > 0 && removedSeen !== removedKey
      ? {
          tone: "warning",
          message: legacyRemovedFiscalPeriodsMessage(removed),
          action: null,
          closable: true,
          onClose: () => {
            platform.storage.setItem(
              LEGACY_REMOVED_NOTICE_SEEN_KEY,
              removedKey,
            );
            setRemovedSeen(removedKey);
          },
        }
      : null,
  );

  return dialog;
}
