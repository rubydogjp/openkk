"use client";

import { ClosedPeriodLock } from "../shared/closed-period-lock.js";
import { useDismissibleLayer } from "../shared/dismissible-layer.js";
import {
  EntryFileActionsButton,
  type EntryFileKind,
} from "./entry-file-actions.js";
import { EntriesTable, MonthNavButton } from "./entries-table.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import type {
  EntryPreviewRow,
} from "@rubydogjp/openkk-client-domain";

export {
  AccountChip,
  AccountChipCell,
  EntriesTable,
  type EntriesHeaderTone,
} from "./entries-table.js";

const entryColors = {
  blue: palette.brand,
  border: palette.borderSubtle,
  text: palette.text,
  accentBg: palette.warningBg,
  accentFg: palette.warning,
};

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

export type { EntryFileKind } from "./entry-file-actions.js";

export type EntryStatusMessage = {
  kind: "info" | "success" | "error";
  text: string;
};

export function EntriesScreen(props: {
  monthLabel: string;
  rows: EntryPreviewRow[];
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  isPlaceholderData: boolean;
  readOnly: boolean;
  onAddEntry: (() => void) | null;
  onImportFile: ((kind: EntryFileKind, file: File) => void) | null;
  onExport: ((kind: EntryFileKind) => void) | null;

  onOpenEntry: ((row: EntryPreviewRow, index: number) => void) | null;

  activeRecordId: string | null;
  statusMessage: EntryStatusMessage | null;
  lockedMessage: {
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
  const isReadOnly = props.readOnly;

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
              <EntryFileActionsButton
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
              この環境ではデモデータを表示しています。
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, minHeight: 320 }}>
          <EntriesTable
            rows={props.rows}
            onOpenEntry={props.onOpenEntry}
            onAddEntry={isReadOnly ? null : props.onAddEntry}
            readOnly={isReadOnly}
            activeRecordId={isReadOnly ? null : props.activeRecordId}
            fillHeight
            headerTone={null}
          />
        </div>
      </div>
    </section>
  );
}

export function VirtualEntryDrawer(props: {
  row: EntryPreviewRow;
  rows: EntryPreviewRow[] | null;
  onClose: () => void;
  onOpenAssist: (href: string) => void;
}) {
  const virtual = props.row.virtual;
  const drawerRef = useDismissibleLayer<HTMLElement>({
    open: virtual != null,
    onDismiss: props.onClose,
    trapFocus: true,
    initialFocusRef: null,
    focusOnOpen: true,
    restoreFocus: true,
  });
  if (virtual == null) return null;
  const rows =
    props.rows == null || props.rows.length === 0 ? [props.row] : props.rows;
  const assistHref = virtual.assistHref;
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
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="補助仕訳の詳細"
        tabIndex={-1}
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
            <AssistGlyph color={null} />
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
            <VirtualEntrySummaryRow
              label="摘要"
              value={props.row.description}
            />
            {rows.map((row, index) => {
              const suffix = rows.length > 1 ? ` ${index + 1}` : "";
              return (
                <div key={`${row.recordId ?? row.date}-${index}`}>
                  <VirtualEntrySummaryRow
                    label={`借方${suffix}`}
                    value={row.debit}
                  />
                  <VirtualEntrySummaryRow
                    label={`借方金額${suffix}`}
                    value={row.debitAmount}
                  />
                  <VirtualEntrySummaryRow
                    label={`貸方${suffix}`}
                    value={row.credit}
                  />
                  <VirtualEntrySummaryRow
                    label={`貸方金額${suffix}`}
                    value={row.creditAmount}
                  />
                </div>
              );
            })}
          </div>
          {assistHref != null ? (
            <button
              type="button"
              onClick={() => props.onOpenAssist(assistHref)}
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
          ) : null}
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
        borderTop:
          props.label === "摘要"
            ? undefined
            : `1px solid ${palette.borderSubtle}`,
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

function AssistGlyph({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        display: "inline-block",
        backgroundColor: color ?? palette.text,
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
