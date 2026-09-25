import type { ReactNode } from "react";

import {
  formatBusinessRatePercent,
  type BookAccountType,
  type EntryPreviewRow,
} from "@rubydogjp/openkk-client-domain";
import { AmountText } from "../shared/amount-field.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import {
  EntryAccountIcon,
  entryAccountPalette,
} from "./entry-account-visual.js";

export type EntriesHeaderTone = "default" | "warning";

const entryColors = {
  blue: palette.brand,
  cardBg: palette.surface,
  border: palette.borderSubtle,
  headerBg: palette.formGroupBg,
  headerBorder: palette.borderStrong,
  headerText: palette.text,
  hoverBg: palette.hoverStrong,
  rowText: palette.textSoft,
  text: palette.text,
  softText: palette.textLabel,
  muted: palette.textMuted,
  tagBorder: palette.borderSubtle,
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
const entriesTableMinimumWidth = 1252;
const rightAlignedColumns = new Set([2, 4]);

export function EntriesTable(props: {
  rows: EntryPreviewRow[];

  onOpenEntry: ((row: EntryPreviewRow, index: number) => void) | null;
  onAddEntry: (() => void) | null;
  readOnly: boolean;

  activeRecordId: string | null;
  fillHeight: boolean;
  headerTone: EntriesHeaderTone | null;
}) {
  const onOpen = props.onOpenEntry;
  const isEmpty = props.rows.length === 0;
  const { fillHeight } = props;
  const activeRecordId = props.activeRecordId;
  const isReadOnly = props.readOnly;
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
            minWidth: entriesTableMinimumWidth,
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
                  textAlign: rightAlignedColumns.has(index)
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
              {props.rows.map((row, index) => {
                const isVirtual = row.virtual != null;
                const rowClickable =
                  onOpen != null && (!isReadOnly || isVirtual);
                const isRecordHead =
                  row.isFirstOfRecord ||
                  row.recordId !== props.rows[index - 1]?.recordId;
                const isRepeat = !isRecordHead;
                const isActive =
                  activeRecordId != null && row.recordId === activeRecordId;
                return (
                  <div
                    key={`${row.recordId}-${index}`}
                    className={`bk-entries-row${rowClickable ? " is-clickable" : ""}${isActive ? " is-active" : ""}${isVirtual ? " is-virtual" : ""}`}
                    onClick={
                      rowClickable ? () => onOpen(row, index) : undefined
                    }
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
                      <RepeatPlaceholderCell align={null} />
                    ) : row.virtual != null ? (
                      <VirtualEntryDateCell label={row.virtual.label} />
                    ) : (
                      <EntryDateVisual
                        dayText={String(Number(row.date.slice(-2)))}
                        weekday={row.weekday}
                      />
                    )}
                    {row.debit.trim().length > 0 ? (
                      <AccountChipCell
                        label={row.debit}
                        type={row.debitType}
                      />
                    ) : (
                      <EmptyLineCell align={null} />
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
                      <EmptyLineCell align={null} />
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
                      <RepeatPlaceholderCell align={null} />
                    ) : (
                      <TableTagCell text={row.partner} align={null} emptyText={null} />
                    )}
                    {isRepeat ? (
                      <RepeatPlaceholderCell align="right" />
                    ) : (
                      <TableTagCell
                        text={formatBusinessRatePercent(row.businessRate)}
                        align="right"
                        emptyText={null}
                      />
                    )}
                    {isRepeat ? (
                      <RepeatPlaceholderCell align={null} />
                    ) : (
                      <TableTagCell text={row.taxCategory} align={null} emptyText={null} />
                    )}
                    {isRepeat ? (
                      <RepeatPlaceholderCell align={null} />
                    ) : (
                      <TableTagCell text={row.businessCategory} align={null} emptyText={null} />
                    )}
                  </div>
                );
              })}

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

      {isEmpty ? <EntriesEmptyState onAddEntry={props.onAddEntry} /> : null}
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

function EntriesEmptyState(props: { onAddEntry: (() => void) | null }) {
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
        {props.onAddEntry != null ? (
          <button
            type="button"
            onClick={props.onAddEntry}
            style={{
              marginTop: 18,
              height: sizes.button.compactHeight,
              padding: "0 16px",
              border: "none",
              borderRadius: radii.sm,
              background: palette.brand,
              color: palette.surface,
              fontSize: fontSize.base,
              fontWeight: fontWeight.bold,
              cursor: "pointer",
            }}
          >
            最初の仕訳を作成
          </button>
        ) : null}
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

export function MonthNavButton(props: {
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

function RepeatPlaceholderCell({
  align,
}: {
  align: "left" | "right" | null;
}) {
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

function EmptyLineCell({ align }: { align: "right" | null }) {
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
  type: BookAccountType;
}) {
  const accountPalette = entryAccountPalette(props.type);
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
        background: accountPalette.background,
        border: `1px solid ${accountPalette.foreground}`,
        color: accountPalette.foreground,
        fontSize: fontSize.sm,
        fontWeight: fontWeight.bold,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      <EntryAccountIcon
        type={props.type}
        color={accountPalette.foreground}
        size={14}
      />
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {props.label}
      </span>
    </div>
  );
}

export function AccountChipCell(props: {
  label: string;
  type: BookAccountType;
}) {
  const accountPalette = entryAccountPalette(props.type);
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
          background: accountPalette.background,
          border: `1px solid ${accountPalette.foreground}`,
          color: accountPalette.foreground,
          fontSize: fontSize.base,
          fontWeight: fontWeight.bold,
          overflow: "hidden",
        }}
      >
        <EntryAccountIcon
          type={props.type}
          color={accountPalette.foreground}
          size={16}
        />
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
      <AmountText bold={false} muted={false}>
        {props.children}
      </AmountText>
    </div>
  );
}

function TableTagCell(props: {
  text: string;
  align: "left" | "right" | null;

  emptyText: string | null;
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
  align: "left" | "right" | null;
  emptyText: string | null;
}) {
  const isEmpty = props.text.trim() === "";
  const displayText = isEmpty ? (props.emptyText ?? "−") : props.text;
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
