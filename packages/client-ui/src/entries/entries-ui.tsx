"use client";

import { AddButton } from "../shared/add-button.js";
import { ClosedPeriodLock } from "../shared/closed-period-lock.js";
import { useDismissibleLayer } from "../shared/dismissible-layer.js";
import { DrawerFrame } from "../shared/drawer-frame.js";
import { AssistIcon } from "../shared/icons.js";
import { CompactLockButton } from "../shared/locked-action.js";
import {
  EntryFileActionsButton,
  type EntryFileKind,
} from "./entry-file-actions.js";
import { EntriesTable } from "./entries-table.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import type {
  EntryPreviewRow,
  PeriodLockMessage,
} from "@rubydogjp/openkk-client-domain";

export { AccountChipCell, EntriesTable } from "./entries-table.js";
export type { EntryFileKind } from "./entry-file-actions.js";

function EntriesMonthSwitcher(props: {
  label: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const switcherBorder = palette.borderHeavy;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        height: sizes.button.compactHeight,
        background: palette.surface,
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
        direction="previous"
        enabled={props.canGoPrevious}
        onClick={props.onPrevious}
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
          color: palette.text,
          letterSpacing: "0.01em",
          borderLeft: `1px solid ${switcherBorder}`,
          borderRight: `1px solid ${switcherBorder}`,
          background: palette.surface,
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

function MonthNavButton(props: {
  direction: "previous" | "next";
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="bk-month-nav"
      onClick={props.onClick}
      disabled={!props.enabled}
      aria-label={props.direction === "previous" ? "前の月" : "次の月"}
      style={{
        width: 40,
        height: "100%",
        borderRadius: 0,
        border: "none",
        background: "transparent",
        color: props.enabled ? palette.text : palette.textMuted,
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

function ChevronSmall({ direction }: { direction: "previous" | "next" }) {
  const points =
    direction === "previous" ? "13 6 7 12 13 18" : "11 6 17 12 11 18";
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

export type EntryStatusMessage = {
  kind: "info" | "success" | "error";
  text: string;
};

export function EntriesScreen(props: {
  monthLabel: string;
  rows: EntryPreviewRow[];
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  readOnly: boolean;
  onAddEntry: (() => void) | null;
  onImportFile: ((kind: EntryFileKind, file: File) => void) | null;
  onExport: ((kind: EntryFileKind) => void) | null;
  onOpenEntry: ((row: EntryPreviewRow, index: number) => void) | null;
  activeRecordId: string | null;
  statusMessage: EntryStatusMessage | null;
  lockedMessage: PeriodLockMessage | null;
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
            canGoPrevious={props.canGoPrevious}
            canGoNext={props.canGoNext}
            onPrevious={props.onPrevious}
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
              <CompactLockButton label="記録終了" />
            ) : props.onAddEntry != null ? (
              <AddButton onClick={props.onAddEntry} />
            ) : null}
          </div>
        </div>

        {props.statusMessage != null ? (
          <StatusBanner message={props.statusMessage} />
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
  rows: EntryPreviewRow[];
  onClose: () => void;
  onOpenAssist: (href: string) => void;
}) {
  const virtual = props.row.virtual;
  const drawerRef = useDismissibleLayer<HTMLElement>({
    open: virtual != null,
    onDismiss: props.onClose,
    initialFocusRef: null,
    focusOnOpen: true,
    restoreFocus: true,
    trapFocus: true,
  });
  if (virtual == null) return null;
  const rows = props.rows.length === 0 ? [props.row] : props.rows;
  const assistHref = virtual.assistHref;
  return (
    <DrawerFrame
      label="補助仕訳の詳細"
      drawerRef={drawerRef}
      onBackdropClick={props.onClose}
    >
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
          <AssistIcon size={18} color={palette.text} />
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
            divider={false}
          />
          {rows.map((row, index) => {
            const suffix = rows.length > 1 ? ` ${index + 1}` : "";
            return (
              <div key={`${row.recordId}-${index}`}>
                <VirtualEntrySummaryRow
                  label={`借方${suffix}`}
                  value={row.debit}
                  divider
                />
                <VirtualEntrySummaryRow
                  label={`借方金額${suffix}`}
                  value={row.debitAmount}
                  divider
                />
                <VirtualEntrySummaryRow
                  label={`貸方${suffix}`}
                  value={row.credit}
                  divider
                />
                <VirtualEntrySummaryRow
                  label={`貸方金額${suffix}`}
                  value={row.creditAmount}
                  divider
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
            <AssistIcon size={18} color={palette.surface} />
            補助 / {virtual.label}画面へ
          </button>
        ) : null}
      </div>
    </DrawerFrame>
  );
}

function VirtualEntrySummaryRow(props: {
  label: string;
  value: string;
  divider: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "104px 1fr",
        minHeight: 42,
        borderTop: props.divider
          ? `1px solid ${palette.borderSubtle}`
          : undefined,
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

function StatusBanner({ message }: { message: EntryStatusMessage }) {
  const colors = (() => {
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
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
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
