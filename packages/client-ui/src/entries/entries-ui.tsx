"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { AmountText } from "../shared/amount-field";
import { ClosedPeriodLock } from "../shared/closed-period-lock";
import { fontSize, fontWeight, palette, radii, shadows, sizes, spacing, typography } from "../shared/design-tokens";
import type { EntryAccountVisualType, EntryPreviewRow } from "@rubydogjp/openkk-client-domain";

const entryColors = {
  blue: palette.brand,
  cardBg: palette.surface,
  border: palette.borderSubtle,

  headerBg: palette.formGroupBg,
  headerBorder: palette.borderStrong,
  headerText: palette.text,
  hoverBg: palette.hoverStrong,
  rowText: palette.textSoft,
  amountText: palette.text,
  text: palette.text,
  softText: palette.textLabel,
  muted: palette.textMuted,

  tagBorder: palette.borderSubtle,

  accentBg: palette.warningBg,
  accentFg: palette.warning,
};

const entryColumns = [
  ["日付", "56px"],
  ["借方", "140px"],
  ["借方金額", "98px"],
  ["貸方", "140px"],
  ["貸方金額", "98px"],
  ["摘要", "200px"],

  ["取引先", "168px"],
  ["事業割合%", "96px"],
  ["課税区分", "128px"],
  ["事業区分", "128px"],
] as const;

const gridTemplateColumns = entryColumns.map(([, width]) => width).join(" ");
const ENTRIES_TABLE_MIN_WIDTH = 1252;

const RIGHT_ALIGNED_COLUMNS = new Set([2, 4]);

export function EntryAccountField(props: {
  value: string;
  type: EntryAccountVisualType;
  onChange: (value: string) => void;
}) {
  const palette = accountPalette(props.type);

  return (
    <div
      style={{
        height: sizes.account.tableHeight,
        borderRadius: radii.sm,
        background: palette.background,
        border: `1px solid ${palette.foreground}`,
        color: palette.foreground,
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
      }}
    >
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          color: palette.foreground,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          caretColor: palette.foreground,
        }}
      />
    </div>
  );
}

export function EntriesMonthSwitcher(props: {
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {

  const switcherBorder = palette.borderHeavy;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        height: sizes.button.compactHeight,
        background: "#FFFFFF",
        border: `1px solid ${switcherBorder}`,
        borderRadius: radii.sm,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
      }}
    >
      <style>{`
        .bk-month-nav { transition: background 80ms ease; }
        .bk-month-nav:hover:not(:disabled) { background: #F1F5F9; }
        .bk-month-nav:active:not(:disabled) { background: #E2E8F0; }
      `}</style>
      <MonthNavButton
        direction="prev"
        enabled={props.canGoPrev}
        onClick={props.onPrev}
      />
      <div
        style={{
          minWidth: 140,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: fontSize.md,
          fontWeight: fontWeight.bold,
          color: entryColors.text,
          letterSpacing: "0.01em",
          borderLeft: `1px solid ${switcherBorder}`,
          borderRight: `1px solid ${switcherBorder}`,
          background: "#FFFFFF",
        }}
      >
        {props.label}
      </div>
      <MonthNavButton
        direction="next"
        enabled={props.canGoNext}
        onClick={props.onNext}
      />
    </div>
  );
}

export type EntryFileKind = "json" | "csv";

export type EntryStatusMessage = {
  kind: "info" | "success" | "error";
  text: string;
};

export type EntriesHeaderTone = "default" | "warning";

export function EntriesScreen(props: {
  monthLabel: string;
  rows: EntryPreviewRow[];
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  isPlaceholderData?: boolean;
  readOnly?: boolean;
  onAddEntry?: () => void;
  onImportFile?: (kind: EntryFileKind, file: File) => void;
  onExport?: (kind: EntryFileKind) => void;

  onOpenEntry?: (row: EntryPreviewRow, index: number) => void;

  activeRecordId?: string | null;
  statusMessage?: EntryStatusMessage | null;
  lockedMessage?: {
    title: string;
    description: string;
  } | null;
}) {
  if (props.lockedMessage != null) {
    return (
      <section style={{ padding: spacing.s24 }}>
        <div style={{ maxWidth: sizes.content.dataMaxWidth, margin: "0 auto" }}>
          <ClosedPeriodLock
            title={props.lockedMessage.title}
            description={props.lockedMessage.description}
          />
        </div>
      </section>
    );
  }

  const showFileMenu = props.onImportFile != null || props.onExport != null;
  const isReadOnly = props.readOnly === true;

  return (
    <section
      style={{
        padding: spacing.s24,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: sizes.content.dataMaxWidth,
          width: "100%",
          margin: "0 auto",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <EntriesMonthSwitcher
            label={props.monthLabel}
            canGoPrev={props.canGoPrev}
            canGoNext={props.canGoNext}
            onPrev={props.onPrev}
            onNext={props.onNext}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showFileMenu ? (
              <FileActionsButton
                onImportFile={props.onImportFile}
                onExport={props.onExport}
              />
            ) : null}
            {isReadOnly ? (
              <ToolbarLockedButton />
            ) : props.onAddEntry ? (
              <ToolbarPrimaryButton label="追加" onClick={props.onAddEntry} />
            ) : null}
          </div>
        </div>

        {props.statusMessage != null ? (
          <StatusBanner message={props.statusMessage} />
        ) : null}

        {props.isPlaceholderData ? (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 10,
              border: `1px solid ${entryColors.border}`,
              background: "#FFFBEE",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: entryColors.text,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: entryColors.accentBg,
                color: entryColors.accentFg,
                fontWeight: fontWeight.bold,
                fontSize: fontSize.sm,
              }}
            >
              i
            </div>
            <div style={{ fontSize: fontSize.sm, lineHeight: 1.6 }}>
              この環境ではサンプルデータを表示しています。
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, minHeight: 320 }}>
          <EntriesTable
            rows={props.rows}
            onOpenEntry={props.onOpenEntry}
            onAddEntry={isReadOnly ? undefined : props.onAddEntry}
            readOnly={isReadOnly}
            activeRecordId={isReadOnly ? null : props.activeRecordId}
            fillHeight
          />
        </div>
      </div>
    </section>
  );
}

export function VirtualEntryDrawer(props: {
  row: EntryPreviewRow;
  onClose: () => void;
  onOpenAssist: (href: string) => void;
}) {
  const virtual = props.row.virtual;
  if (virtual == null) return null;
  return (
    <>
      <div
        onClick={props.onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.32)",
          zIndex: 9998,
        }}
      />
      <aside
        role="dialog"
        aria-label="補助仕訳の詳細"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: sizes.drawer.width,
          maxWidth: "100vw",
          height: "100vh",
          background: palette.surface,
          zIndex: 9999,
          boxShadow: shadows.drawer,
          display: "flex",
          flexDirection: "column",
          animation: "bk-drawer-slide-in 220ms cubic-bezier(0.2, 0, 0, 1)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <style>{`
          @keyframes bk-drawer-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        <header
          style={{
            height: sizes.drawer.headerHeight,
            padding: "0 20px",
            borderBottom: `1px solid ${palette.borderStrong}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: palette.text,
            }}
          >
            <AssistGlyph />
            補助 / {virtual.label}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="閉じる"
            style={{
              width: 32,
              height: 32,
              borderRadius: radii.sm,
              border: `1px solid ${palette.borderStrong}`,
              background: palette.surface,
              color: palette.text,
              cursor: "pointer",
              fontSize: fontSize.lg,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              border: `1px solid ${palette.actionBorder}`,
              background: palette.actionBg,
              borderRadius: radii.md,
              padding: "14px 16px",
              color: palette.text,
              fontSize: fontSize.base,
              lineHeight: 1.7,
            }}
          >
            この仕訳は補助機能によって提案された仮想的なものです。本締めの手順で実体化されます。
          </div>
          <div
            style={{
              border: `1px solid ${palette.borderStrong}`,
              borderRadius: radii.md,
              overflow: "hidden",
            }}
          >
            <VirtualEntrySummaryRow label="摘要" value={props.row.description} />
            <VirtualEntrySummaryRow label="借方" value={props.row.debit} />
            <VirtualEntrySummaryRow label="借方金額" value={props.row.debitAmount} />
            <VirtualEntrySummaryRow label="貸方" value={props.row.credit} />
            <VirtualEntrySummaryRow label="貸方金額" value={props.row.creditAmount} />
          </div>
          <button
            type="button"
            onClick={() => props.onOpenAssist(virtual.assistHref)}
            style={{
              height: sizes.button.ctaHeight,
              borderRadius: radii.sm,
              border: "none",
              background: palette.action,
              color: palette.surface,
              fontSize: fontSize.base,
              fontWeight: fontWeight.bold,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.s8,
            }}
          >
            <AssistGlyph color={palette.surface} />
            補助 / {virtual.label}画面へ
          </button>
        </div>
      </aside>
    </>
  );
}

function VirtualEntrySummaryRow(props: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "104px 1fr",
        minHeight: 42,
        borderTop: props.label === "摘要" ? undefined : `1px solid ${palette.borderSubtle}`,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          background: palette.headerSurface,
          color: palette.textLabel,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          padding: "10px 12px",
          color: palette.text,
          fontSize: fontSize.base,
          fontWeight: fontWeight.medium,
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

function AssistGlyph({ color = palette.text }: { color?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        display: "inline-block",
        backgroundColor: color,
        maskImage: "url('/icons/assist.svg')",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/assist.svg')",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function StatusBanner({ message }: { message: EntryStatusMessage }) {
  const palette = (() => {
    switch (message.kind) {
      case "success":
        return { bg: "#ECFDF5", border: "#A7F3D0", fg: "#065F46" };
      case "error":
        return { bg: "#FEF2F2", border: "#FCA5A5", fg: "#991B1B" };
      default:
        return { bg: "#EFF6FF", border: "#BFDBFE", fg: "#1E40AF" };
    }
  })();
  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 10,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        padding: "10px 14px",
        fontSize: fontSize.base,
        fontWeight: fontWeight.semibold,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {message.text}
    </div>
  );
}

function ToolbarPrimaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: "none",
        background: entryColors.blue,
        color: palette.surface,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
        boxShadow: "0 1px 2px rgba(37, 99, 235, 0.18)",
      }}
    >
      <PlusIcon /> {label}
    </button>
  );
}

function ToolbarLockedButton() {
  return (
    <button
      type="button"
      disabled
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        color: palette.textSoft,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: "default",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
      }}
    >
      <LockIcon /> 記録終了
    </button>
  );
}

function FileActionsButton(props: {
  onImportFile?: (kind: EntryFileKind, file: File) => void;
  onExport?: (kind: EntryFileKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <style>{`
        .bk-menu-item { transition: background 80ms ease; }
        .bk-menu-item:hover { background: #F1F5F9; }
      `}</style>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          height: sizes.button.compactHeight,
          minWidth: sizes.button.compactIconTextMinWidth,
          padding: "0 14px",
          borderRadius: radii.sm,
          border: `1px solid ${entryColors.border}`,
          background: open ? "#F1F5F9" : "#FFFFFF",
          color: entryColors.text,
          fontSize: fontSize.base,
          fontWeight: fontWeight.semibold,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: spacing.s8,
          transition: "background 80ms ease",
        }}
      >
        <FileOpenIcon />
        ファイル
        <ChevronDown />
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 42,
            right: 0,
            zIndex: 60,
            minWidth: 240,
            background: "#FFFFFF",
            border: `1px solid ${entryColors.border}`,
            borderRadius: radii.md,
            boxShadow:
              "0 12px 32px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.04)",
            padding: 6,
            display: "grid",
            gap: 2,
          }}
        >
          {props.onImportFile != null ? (
            <>
              <MenuSectionLabel>読み込む</MenuSectionLabel>
              <FileMenuItem
                accept=".json,application/json"
                onSelect={(file) => {
                  props.onImportFile?.("json", file);
                  setOpen(false);
                }}
              >
                JSON ファイルから
              </FileMenuItem>
              <FileMenuItem
                accept=".csv,text/csv"
                onSelect={(file) => {
                  props.onImportFile?.("csv", file);
                  setOpen(false);
                }}
              >
                CSV ファイルから
              </FileMenuItem>
            </>
          ) : null}
          {props.onImportFile != null && props.onExport != null ? (
            <MenuDivider />
          ) : null}
          {props.onExport != null ? (
            <>
              <MenuSectionLabel>書き出す</MenuSectionLabel>
              <MenuItem
                onClick={() => {
                  props.onExport?.("json");
                  setOpen(false);
                }}
              >
                JSON でダウンロード
              </MenuItem>
              <MenuItem
                onClick={() => {
                  props.onExport?.("csv");
                  setOpen(false);
                }}
              >
                CSV でダウンロード
              </MenuItem>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 12px 4px",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        color: entryColors.muted,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function MenuDivider() {
  return (
    <div
      style={{
        height: 1,
        background: entryColors.border,
        margin: "6px 4px",
      }}
    />
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="bk-menu-item"
      style={{
        height: 34,
        padding: "0 12px",
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: entryColors.text,
        fontSize: fontSize.base,
        fontWeight: fontWeight.medium,
        cursor: "pointer",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function FileMenuItem({
  accept,
  onSelect,
  children,
}: {
  accept: string;
  onSelect: (file: File) => void;
  children: ReactNode;
}) {
  return (
    <label
      role="menuitem"
      className="bk-menu-item"
      style={{
        height: 34,
        padding: "0 12px",
        textAlign: "left",
        background: "transparent",
        color: entryColors.text,
        fontSize: fontSize.base,
        fontWeight: fontWeight.medium,
        cursor: "pointer",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
      <input
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file != null) {
            onSelect(file);
          }
          event.currentTarget.value = "";
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}

function ChevronDown() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <polyline
        points="6 9 12 15 18 9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileOpenIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        display: "block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        maskImage: "url('/icons/file-open.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/file-open.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function PlusIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 15,
        height: 15,
        display: "block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        maskImage: "url('/icons/lock.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/lock.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

export function EntriesPreviewSurface(props: { rows: EntryPreviewRow[] }) {
  const entryTableScale = 1352 / 1152;
  const scaledTableWidth = 1152 * entryTableScale;

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        padding: "18px 24px 96px",
      }}
    >
      <div
        style={{ display: "grid", justifyItems: "center", marginBottom: 18 }}
      >
        <EntriesMonthSwitcher
          label="2026年9月"
          canGoPrev
          canGoNext
          onPrev={() => undefined}
          onNext={() => undefined}
        />
      </div>
      <div
        style={{
          width: "100%",
          height: 475,
          position: "relative",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: scaledTableWidth,
            height: 352,
            overflow: "visible",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 1152,
              transform: `scale(${entryTableScale})`,
              transformOrigin: "top left",
            }}
          >
            <EntriesTable rows={props.rows} />
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 28,
          bottom: 28,
        }}
      >
        <button
          type="button"
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            border: "none",
            background: entryColors.blue,
            color: "#ffffff",
            fontSize: typography.pageTitle.fontSize,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function EntriesTable(props: {
  rows: EntryPreviewRow[];

  onOpenEntry?: (row: EntryPreviewRow, index: number) => void;
  onAddEntry?: () => void;
  readOnly?: boolean;

  activeRecordId?: string | null;
  fillHeight?: boolean;
  headerTone?: EntriesHeaderTone;
}) {
  const onOpen = props.onOpenEntry;
  const isEmpty = props.rows.length === 0;
  const fillHeight = props.fillHeight ?? false;
  const activeRecordId = props.activeRecordId ?? null;
  const isReadOnly = props.readOnly === true;
  const headerTone = resolveEntriesHeaderTone(props.headerTone ?? "default");
  return (
    <div
      style={{
        background: entryColors.cardBg,

        border: `1px solid ${palette.borderEmphasis}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        height: fillHeight ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        minHeight: 320,

        position: "relative",
      }}
    >
      <style>{`
        .bk-entries-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .bk-entries-scroll::-webkit-scrollbar-track { background: transparent; }
        .bk-entries-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-entries-scroll::-webkit-scrollbar-thumb:hover {
          background: #94A3B8;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .bk-entries-row { transition: background 80ms ease; }
        .bk-entries-row.is-clickable { cursor: pointer; }
        .bk-entries-row.is-clickable:hover { background: ${entryColors.hoverBg} !important; }

        .bk-entries-row.is-active { background: ${palette.actionBg} !important; }
        .bk-entries-row.is-active.is-clickable:hover { background: #DBEAFE !important; }
      `}</style>
      <div
        className="bk-entries-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <div
          style={{
            minWidth: ENTRIES_TABLE_MIN_WIDTH,
            display: "flex",
            flexDirection: "column",
            minHeight: "100%",
          }}
        >

          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              display: "grid",
              gridTemplateColumns,
              alignItems: "center",
              height: sizes.field.height,
              background: headerTone.background,
              borderBottom: `1px solid ${headerTone.border}`,
            }}
          >
            {entryColumns.map(([label], index) => (
              <div
                key={`${label}-${index}`}
                style={{
                  padding: "0 12px",
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.bold,
                  color: headerTone.color,
                  textAlign: RIGHT_ALIGNED_COLUMNS.has(index)
                    ? "right"
                    : "left",
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {!isEmpty ? (
            <>
              {(() => {

                let lastRecordId: string | undefined = undefined;
                return props.rows.map((row, index) => {
                  const isVirtual = row.virtual != null;
                  const rowClickable = onOpen != null && (!isReadOnly || isVirtual);
                  const isRecordHead =
                    row.isFirstOfRecord !== false ||
                    row.recordId !== lastRecordId;
                  const isRepeat = !isRecordHead;
                  const isActive =
                    activeRecordId != null &&
                    row.recordId != null &&
                    row.recordId === activeRecordId;
                  lastRecordId = row.recordId;
                  return (
                    <div
                      key={`${row.recordId ?? row.date}-${index}`}
                      className={`bk-entries-row${rowClickable ? " is-clickable" : ""}${isActive ? " is-active" : ""}${isVirtual ? " is-virtual" : ""}`}
                      onClick={rowClickable ? () => onOpen(row, index) : undefined}
                      onKeyDown={
                        rowClickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpen(row, index);
                              }
                          }
                        : undefined
                      }
                      role={rowClickable ? "button" : undefined}
                      tabIndex={rowClickable ? 0 : undefined}
                      style={{
                        display: "grid",
                        gridTemplateColumns,
                        alignItems: "center",
                        height: 52,
                        background: "#FFFFFF",

                        borderTop:
                          isRecordHead && index > 0
                            ? `1px solid ${entryColors.border}`
                            : undefined,

                        boxShadow: isActive
                          ? `inset 3px 0 0 ${entryColors.blue}`
                          : undefined,
                      }}
                    >
                      {isRepeat ? (
                        <RepeatPlaceholderCell />
                      ) : row.virtual != null ? (
                        <VirtualEntryDateCell label={row.virtual.label} />
                      ) : (
                        <EntryDateVisual
                          dayText={String(Number(row.date.slice(-2)))}
                          weekday={row.weekday}
                        />
                      )}
                      {row.debit.trim().length > 0 ? (
                        <AccountChipCell label={row.debit} type={row.debitType} />
                      ) : (
                        <EmptyLineCell />
                      )}
                      {row.debitAmount.trim().length > 0 ? (
                        <TableAmountCell>{row.debitAmount}</TableAmountCell>
                      ) : (
                        <EmptyLineCell align="right" />
                      )}
                      {row.credit.trim().length > 0 ? (
                        <AccountChipCell
                          label={row.credit}
                          type={row.creditType}
                        />
                      ) : (
                        <EmptyLineCell />
                      )}
                      {row.creditAmount.trim().length > 0 ? (
                        <TableAmountCell>{row.creditAmount}</TableAmountCell>
                      ) : (
                        <EmptyLineCell align="right" />
                      )}
                      {isRepeat ? (
                        <RepeatPlaceholderCell align="left" />
                      ) : (
                        <div
                          style={{
                            padding: "0 12px",
                            fontSize: fontSize.base,
                            color: entryColors.rowText,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {row.description}
                        </div>
                      )}
                      {isRepeat ? (
                        <RepeatPlaceholderCell />
                      ) : (
                        <TableTagCell text={row.partner} />
                      )}
                      {isRepeat ? (
                        <RepeatPlaceholderCell align="right" />
                      ) : (
                        <TableTagCell
                          text={row.businessRate}
                          align="right"

                          emptyText="100"
                        />
                      )}
                      {isRepeat ? (
                        <RepeatPlaceholderCell />
                      ) : (
                        <TableTagCell text={row.taxCategory} />
                      )}
                      {isRepeat ? (
                        <RepeatPlaceholderCell />
                      ) : (
                        <TableTagCell text={row.businessCategory} />
                      )}
                    </div>
                  );
                });
              })()}

              <div
                aria-hidden="true"
                style={{
                  flex: "1 1 0",
                  minHeight: 0,
                  background: palette.formGroupBg,
                  borderTop: `1px solid ${palette.borderStrong}`,
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      {isEmpty ? <EntriesEmptyState /> : null}
    </div>
  );
}

function resolveEntriesHeaderTone(tone: EntriesHeaderTone): {
  background: string;
  color: string;
  border: string;
} {
  switch (tone) {
    case "warning":
      return {
        background: palette.warningBg,
        color: entryColors.headerText,
        border: palette.warningBorder,
      };
    case "default":
    default:
      return {
        background: entryColors.headerBg,
        color: entryColors.headerText,
        border: entryColors.headerBorder,
      };
  }
}

function EntriesEmptyState() {
  return (
    <div
      style={{
        position: "absolute",
        top: sizes.field.height,
        left: 0,
        right: 0,
        bottom: 0,
        display: "grid",
        placeItems: "center",
        padding: 32,
        background: palette.formGroupBg,
        borderTop: `1px solid ${palette.borderStrong}`,
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
            color: entryColors.softText,
          }}
        >
          <EmptyTableIcon />
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: entryColors.text,
          }}
        >
          まだ取引がありません
        </div>
      </div>
    </div>
  );
}

function EmptyTableIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1="3"
        y1="10"
        x2="21"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1="9"
        y1="5"
        x2="9"
        y2="19"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function MonthNavButton(props: {
  direction: "prev" | "next";
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="bk-month-nav"
      onClick={props.onClick}
      disabled={!props.enabled}
      aria-label={props.direction === "prev" ? "前の月" : "次の月"}
      style={{
        width: 40,
        height: "100%",
        borderRadius: 0,
        border: "none",
        background: "transparent",
        color: props.enabled ? entryColors.text : entryColors.muted,
        cursor: props.enabled ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      <ChevronSmall direction={props.direction} />
    </button>
  );
}

function ChevronSmall({ direction }: { direction: "prev" | "next" }) {
  const points = direction === "prev" ? "13 6 7 12 13 18" : "11 6 17 12 11 18";
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RepeatPlaceholderCell({ align }: { align?: "left" | "right" }) {
  return (
    <div
      style={{
        padding: "0 12px",
        fontSize: fontSize.base,
        color: entryColors.muted,
        textAlign: align ?? "center",
      }}
    >
      〃
    </div>
  );
}

function EmptyLineCell({ align }: { align?: "right" }) {
  return (
    <div
      style={{
        padding: "0 12px",
        fontSize: fontSize.base,
        color: entryColors.muted,
        textAlign: align ?? "center",
      }}
    >
      -
    </div>
  );
}

function EntryDateVisual(props: { dayText: string; weekday: string }) {
  return (
    <div
      style={{
        padding: "0 12px",
        display: "grid",
        justifyItems: "center",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: fontSize.base,
          fontWeight: fontWeight.bold,
          color: entryColors.text,
          lineHeight: 1.1,
        }}
      >
        {props.dayText}
      </div>
      <div
        style={{
          fontSize: fontSize.micro,
          fontWeight: fontWeight.semibold,
          color: entryColors.softText,
        }}
      >
        {props.weekday}
      </div>
    </div>
  );
}

function VirtualEntryDateCell({ label }: { label: string }) {
  return (
    <div
      title={`補助 / ${label}`}
      aria-label={`補助 / ${label}`}
      style={{
        padding: "0 12px",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          display: "block",
          backgroundColor: palette.warning,
          maskImage: "url('/icons/assist-filled.svg')",
          maskRepeat: "no-repeat",
          maskPosition: "center",
          maskSize: "contain",
          WebkitMaskImage: "url('/icons/assist-filled.svg')",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          WebkitMaskSize: "contain",
        }}
      />
    </div>
  );
}

export function AccountChip(props: {
  label: string;
  type: EntryAccountVisualType;
}) {
  const palette = accountPalette(props.type);
  return (
    <div
      style={{
        height: sizes.account.inlineHeight,
        width: sizes.account.tableWidth,
        borderRadius: radii.sm,
        padding: "0 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s8,
        background: palette.background,
        border: `1px solid ${palette.foreground}`,
        color: palette.foreground,
        fontSize: fontSize.sm,
        fontWeight: fontWeight.bold,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      <AccountTypeIcon type={props.type} color={palette.foreground} size={14} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {props.label}
      </span>
    </div>
  );
}

export function AccountChipCell(props: {
  label: string;
  type: EntryAccountVisualType;
}) {
  const palette = accountPalette(props.type);
  return (
    <div style={{ padding: "0 2px" }}>
      <div
        style={{
          width: sizes.account.tableWidth,
          height: sizes.account.tableHeight,
          borderRadius: radii.sm,
          padding: "0 11px",
          display: "flex",
          alignItems: "center",
          gap: spacing.s8,
          background: palette.background,
          border: `1px solid ${palette.foreground}`,
          color: palette.foreground,
          fontSize: fontSize.base,
          fontWeight: fontWeight.bold,
          overflow: "hidden",
        }}
      >
        <AccountTypeIcon type={props.type} color={palette.foreground} size={16} />
        <span
          style={{
            display: "block",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {props.label}
        </span>
      </div>
    </div>
  );
}

function TableAmountCell(props: { children: ReactNode }) {

  return (
    <div style={{ padding: "0 12px", textAlign: "right" }}>
      <AmountText>{props.children}</AmountText>
    </div>
  );
}

function TableTagCell(props: {
  text: string;
  align?: "left" | "right";

  emptyText?: string;
}) {
  return (
    <div style={{ padding: "0 8px" }}>
      <TagChip
        text={props.text}
        align={props.align}
        emptyText={props.emptyText}
      />
    </div>
  );
}

function TagChip(props: {
  text: string;
  align?: "left" | "right";
  emptyText?: string;
}) {
  const value = props.text == null ? "" : String(props.text);
  const isEmpty = value.trim() === "";
  const displayText = isEmpty ? props.emptyText ?? "−" : value;
  return (
    <div
      style={{
        height: sizes.chip.height,
        padding: "0 10px",
        borderRadius: radii.pill,
        background: "#FFFFFF",
        border: `1px solid ${isEmpty ? entryColors.tagBorder : entryColors.blue}`,
        color: isEmpty ? entryColors.muted : entryColors.blue,
        display: "flex",
        alignItems: "center",
        justifyContent: props.align === "right" ? "flex-end" : "flex-start",
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        fontSize: fontSize.sm,
        fontWeight: fontWeight.regular,
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {displayText}
      </span>
    </div>
  );
}

function accountPalette(type: EntryAccountVisualType) {
  switch (type) {
    case "asset":
      return { background: palette.accountAssetBg, foreground: palette.accountAsset, border: palette.accountAssetBorder, surface: palette.surface };
    case "liability":
      return { background: palette.accountLiabilityBg, foreground: palette.accountLiability, border: palette.accountLiabilityBorder, surface: palette.surface };
    case "equity":
    case "revenue":
      return { background: palette.accountEquityBg, foreground: palette.accountEquity, border: palette.accountEquityBorder, surface: palette.surface };
    case "cost_of_sales":
    case "expense":
      return { background: palette.accountExpenseBg, foreground: palette.accountExpense, border: palette.accountExpenseBorder, surface: palette.surface };
  }
}

function AccountTypeIcon(props: { type: EntryAccountVisualType; color: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: props.size,
        height: props.size,
        display: "block",
        flexShrink: 0,
        backgroundColor: props.color,
        maskImage: `url('${accountIconPath(props.type)}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${accountIconPath(props.type)}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function accountIconPath(type: EntryAccountVisualType): string {
  switch (type) {
    case "asset":
      return "/icons/assets.svg";
    case "liability":
      return "/icons/liabilities.svg";
    case "equity":
      return "/icons/net-assets.svg";
    case "revenue":
      return "/icons/revenue.svg";
    case "cost_of_sales":
    case "expense":
      return "/icons/expense.svg";
  }
}
