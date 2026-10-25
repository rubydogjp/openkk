"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation.js";

import {
  AppError,
  assertFiscalPeriodArchiveByteLength,
  readFiscalPeriodArchiveZip,
  type FiscalPeriod,
  type FiscalPeriodPhase,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAppState,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import { AddButton } from "../shared/add-button.js";
import { AppErrorText } from "../shared/app-error-text.js";
import { LockButton } from "../shared/locked-action.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { usePopoverLifecycle } from "../shared/dismissible-layer.js";
import { formatCalendarDate } from "../shared/calendar-date.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  typography,
} from "../shared/design-tokens.js";

export function FiscalPeriodsContent() {
  const router = useRouter();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const editingLocked = openkkConfig.editingPolicy.locked;
  const allowArchiveImport = openkkConfig.fiscalPeriodPolicy.allowArchiveImport;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const archiveImportLock = useRef(new ExclusiveActionLock());
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [screenError, setScreenError] = useState<unknown>(null);
  const { containerRef: fileMenuContainerRef, popupRef: fileMenuRef } =
    usePopoverLifecycle<HTMLDivElement, HTMLDivElement>({
      open: fileMenuOpen,
      onDismiss: () => setFileMenuOpen(false),
    });

  const handleArchiveFile = async (file: File) => {
    const release = archiveImportLock.current.tryAcquire();
    if (release == null) return;
    setIsImportingArchive(true);
    try {
      setScreenError(null);
      assertFiscalPeriodArchiveByteLength(file.size);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const payload = readFiscalPeriodArchiveZip(bytes);
      const createdId = await appState.importArchivedFiscalPeriod(payload);
      appState.selectFiscalPeriod(createdId);
      router.push("/steps");
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "圧縮済みファイルの展開に失敗しました",
          fallbackDeveloperMessage:
            "fiscal-periods: import archived fiscal period failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsImportingArchive(false);
      release();
    }
  };

  return (
    <section
      style={{
        padding: 24,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: sizes.content.controlBarMaxWidth,
          width: "100%",
          margin: "0 auto",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ marginBottom: 14 }}>
          <h1
            style={{
              margin: 0,
              fontSize: typography.dialogTitle.fontSize,
              fontWeight: fontWeight.bold,
              color: palette.text,
              letterSpacing: "-0.01em",
            }}
          >
            期間の選択
          </h1>
        </header>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {allowArchiveImport ? (
            <div ref={fileMenuContainerRef} style={{ position: "relative" }}>
              {editingLocked ? (
                <LockButton label="ファイル" />
              ) : (
                <button
                  type="button"
                  onClick={() => setFileMenuOpen((value) => !value)}
                  disabled={isImportingArchive}
                  aria-haspopup="menu"
                  aria-expanded={fileMenuOpen}
                  style={{
                    height: 34,
                    padding: "0 14px",
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.borderStrong}`,
                    background: palette.surface,
                    color: palette.text,
                    fontSize: fontSize.base,
                    fontWeight: fontWeight.bold,
                    cursor: isImportingArchive ? "default" : "pointer",
                    opacity: isImportingArchive ? 0.62 : 1,
                  }}
                >
                  {isImportingArchive ? "展開中" : "ファイル"}
                </button>
              )}
              {fileMenuOpen ? (
                <div
                  ref={fileMenuRef}
                  role="menu"
                  tabIndex={-1}
                  style={{
                    position: "absolute",
                    top: 40,
                    right: 0,
                    zIndex: 5,
                    minWidth: 220,
                    padding: 6,
                    borderRadius: radii.md,
                    border: `1px solid ${palette.borderStrong}`,
                    background: palette.surface,
                    boxShadow: shadows.popup,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFileMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      padding: "9px 10px",
                      borderRadius: radii.sm,
                      color: palette.text,
                      fontSize: fontSize.base,
                      fontWeight: fontWeight.semibold,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    圧縮済みのファイルを選択
                  </button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (file != null) void handleArchiveFile(file);
                }}
              />
            </div>
          ) : null}
          {editingLocked ? (
            <LockButton label="追加" />
          ) : (
            <AddButton onClick={() => router.push("/fiscal-periods/new")} />
          )}
        </div>

        <FiscalPeriodsTable
          items={appState.fiscalPeriods}
          onSelect={(periodId) => {
            appState.selectFiscalPeriod(periodId);
            router.push("/steps");
          }}
        />
        {screenError != null ? (
          <div style={{ marginTop: 12 }}>
            <AppErrorText
              error={screenError}
              style={null}
              fallbackUserMessage={null}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FiscalPeriodsTable({
  items,
  onSelect,
}: {
  items: FiscalPeriod[];
  onSelect: (periodId: string) => void;
}) {
  const isEmpty = items.length === 0;
  return (
    <div
      style={{
        background: palette.surface,
        border: `1px solid ${palette.borderEmphasis}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 320,
      }}
    >
      <style>{`
        .bk-fiscal-periods-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .bk-fiscal-periods-scroll::-webkit-scrollbar-track { background: transparent; }
        .bk-fiscal-periods-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-fiscal-periods-scroll::-webkit-scrollbar-thumb:hover {
          background: #94A3B8;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-fiscal-period-row { transition: background 80ms ease; }
        .bk-fiscal-period-row.is-clickable { cursor: pointer; }
        .bk-fiscal-period-row.is-clickable:hover { background: ${palette.hoverStrong} !important; }
      `}</style>
      {isEmpty ? (
        <FiscalPeriodsEmptyState />
      ) : (
        <div
          className="bk-fiscal-periods-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
            }}
          >
            {items.map((period, index) => (
              <FiscalPeriodRow
                key={period.id}
                period={period}
                showDivider={index > 0}
                onSelect={() => onSelect(period.id)}
              />
            ))}
            <div
              aria-hidden="true"
              style={{
                flex: "1 1 0",
                minHeight: 0,
                background: palette.formGroupBg,
                borderTop: `1px solid ${palette.borderStrong}`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FiscalPeriodRow({
  period,
  showDivider,
  onSelect,
}: {
  period: FiscalPeriod;
  showDivider: boolean;
  onSelect: () => void;
}) {
  const purged = period.archiveStatus === "purged";
  const showOpeningBsChip =
    period.archiveStatus === "active" &&
    !period.openingBalancesCompleted &&
    period.phase !== "pre_opening";

  const content = (
    <>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: purged ? palette.textLabel : palette.text,
            lineHeight: 1.4,
          }}
        >
          {period.name}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: fontSize.sm,
            color: palette.textLabel,
          }}
        >
          {period.startDate} 〜 {period.endDate}
        </div>
        {purged && period.archivedAt != null ? (
          <div
            style={{
              marginTop: 4,
              fontSize: fontSize.xs,
              color: palette.textSoft,
            }}
          >
            圧縮保存日時: {formatCalendarDate(period.archivedAt, null)}
          </div>
        ) : null}
        {showOpeningBsChip ? (
          <div style={{ marginTop: 6 }}>
            <InlineChip
              label="期首BS"
              background={palette.brandTint}
              foreground={palette.brand}
            />
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <InlineChip {...periodStatusChip(period)} />
        {purged ? null : (
          <div
            style={{
              fontSize: fontSize.xl,
              color: palette.textLabel,
              lineHeight: 1,
            }}
          >
            ›
          </div>
        )}
      </div>
    </>
  );

  const sharedStyle = {
    borderTop: showDivider ? `1px solid ${palette.hairline}` : "none",
    background: palette.surface,
    padding: "14px 16px",
    textAlign: "left" as const,
    width: "100%",
    boxSizing: "border-box" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  };

  if (purged) {
    return (
      <div
        className="bk-fiscal-period-row"
        aria-disabled="true"
        style={{ ...sharedStyle, cursor: "default" }}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="bk-fiscal-period-row is-clickable"
      style={{ ...sharedStyle, border: "none", cursor: "pointer" }}
    >
      {content}
    </button>
  );
}

function FiscalPeriodsEmptyState() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 240,
        display: "grid",
        placeItems: "center",
        padding: 32,
        background: palette.formGroupBg,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto",
            borderRadius: 14,
            background: palette.surface,
            border: `1px solid ${palette.borderStrong}`,
            display: "grid",
            placeItems: "center",
            color: palette.textSoft,
          }}
        >
          <EmptyPeriodsIcon />
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: palette.text,
          }}
        >
          期間がありません
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: fontSize.sm,
            color: palette.textSoft,
            lineHeight: 1.7,
          }}
        >
          上の「追加」ボタンから 1 件目を作成できます。
        </div>
      </div>
    </div>
  );
}

function EmptyPeriodsIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <rect
        x={4}
        y={5}
        width={16}
        height={15}
        rx={2}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1={4}
        y1={10}
        x2={20}
        y2={10}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1={8}
        y1={3}
        x2={8}
        y2={7}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1={16}
        y1={3}
        x2={16}
        y2={7}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InlineChip({
  label,
  background,
  foreground,
}: {
  label: string;
  background: string;
  foreground: string;
}) {
  return (
    <span
      style={{
        height: 22,
        padding: "0 10px",
        borderRadius: 999,
        background,
        color: foreground,
        display: "inline-flex",
        alignItems: "center",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
      }}
    >
      {label}
    </span>
  );
}

function periodStatusChip(period: FiscalPeriod): {
  label: string;
  background: string;
  foreground: string;
} {
  if (period.archiveStatus === "purged") {
    return {
      label: "圧縮保存済み（削除）",
      background: palette.formGroupBg,
      foreground: palette.textSoft,
    };
  }
  if (period.archiveStatus === "archived") {
    return {
      label: "圧縮保存済み",
      background: "#DCFCE7",
      foreground: palette.success,
    };
  }
  return period.phase === "journalizing"
    ? {
        label: phaseLabel(period.phase),
        background: "#DCFCE7",
        foreground: palette.success,
      }
    : {
        label: phaseLabel(period.phase),
        background: palette.formGroupBg,
        foreground: palette.textLabel,
      };
}

function phaseLabel(phase: FiscalPeriodPhase) {
  if (phase === "pre_opening") return "開始前";
  if (phase === "journalizing") return "記帳中";
  if (phase === "pre_closing") return "仮締め済み";
  return "決算後";
}
