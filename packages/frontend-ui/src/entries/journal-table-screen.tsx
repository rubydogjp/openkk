"use client";

import type { ReactNode } from "react";

import {
  JOURNAL_TABLE_FIELDS,
  JOURNAL_TABLE_HEADERS,
  type JournalTableProblem,
  type JournalTableRow,
  type PeriodLockMessage,
} from "@rubydogjp/openkk-driver";

import { ClosedPeriodLock } from "../shared/closed-period-lock.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../shared/design-tokens.js";
import {
  EntryFileActionsButton,
  type EntryFileKind,
} from "./entry-file-actions.js";

export type JournalTableRowStatus = "added" | "changed" | "removed";

export type JournalTableScreenRow = JournalTableRow & {
  entryKey: string;
  status: JournalTableRowStatus | null;
};

export type JournalTableReview =
  | {
      kind: "changes";
      added: number;
      changed: number;
      removed: number;
      unchanged: number;
      applying: boolean;
    }
  | { kind: "problems"; problems: JournalTableProblem[] };

const STATUS_LABELS: Record<JournalTableRowStatus, string> = {
  added: "追加",
  changed: "変更",
  removed: "削除",
};

const STATUS_COLORS: Record<
  JournalTableRowStatus,
  { background: string; text: string }
> = {
  added: { background: palette.successBg, text: palette.success },
  changed: { background: palette.warningBg, text: palette.warning },
  removed: { background: palette.dangerBg, text: palette.danger },
};

const NUMERIC_FIELDS = new Set<keyof JournalTableRow>([
  "debitAmount",
  "creditAmount",
  "businessRate",
]);

const COLUMN_WIDTHS: Record<keyof JournalTableRow, number> = {
  entryNumber: 120,
  date: 104,
  debitAccount: 150,
  debitAmount: 104,
  creditAccount: 150,
  creditAmount: 104,
  description: 220,
  partner: 150,
  taxCategory: 130,
  businessCategory: 130,
  businessRate: 84,
};

export function JournalTableScreen(props: {
  viewSwitch: ReactNode;
  rows: JournalTableScreenRow[];
  review: JournalTableReview | null;
  lockedMessage: PeriodLockMessage | null;
  onImportFile: ((kind: EntryFileKind, file: File) => void) | null;
  onExport: ((kind: EntryFileKind) => void) | null;
  onOpenRow: ((row: JournalTableScreenRow) => void) | null;
  onApplyReview: () => void;
  onDismissReview: () => void;
}) {
  const reviewing = props.review != null;
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
          {props.viewSwitch}
          {props.lockedMessage == null &&
          !reviewing &&
          (props.onImportFile != null || props.onExport != null) ? (
            <EntryFileActionsButton
              onImportFile={props.onImportFile}
              onExport={props.onExport}
            />
          ) : null}
        </div>

        {props.lockedMessage != null ? (
          <ClosedPeriodLock
            title={props.lockedMessage.title}
            description={props.lockedMessage.description}
          />
        ) : (
          <>
            {props.review != null ? (
              <ReviewBar
                review={props.review}
                onApply={props.onApplyReview}
                onDismiss={props.onDismissReview}
              />
            ) : null}
            {props.review?.kind === "problems" ? null : (
              <JournalTable
                rows={props.rows}
                showStatus={reviewing}
                onOpenRow={reviewing ? null : props.onOpenRow}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ReviewBar(props: {
  review: JournalTableReview;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { review } = props;
  if (review.kind === "problems") {
    return (
      <div
        role="alert"
        style={{
          marginBottom: 12,
          border: `1px solid ${palette.dangerBorder}`,
          background: palette.dangerBg,
          borderRadius: radii.md,
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <strong style={{ fontSize: fontSize.base, color: palette.text }}>
            取り込めない行があります。CSV
            を直してから、もう一度取り込んでください。
          </strong>
          <BarButton primary={false} disabled={false} onClick={props.onDismiss}>
            閉じる
          </BarButton>
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            fontSize: fontSize.sm,
            color: palette.text,
            lineHeight: 1.8,
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {review.problems.map((problem, index) => (
            <li key={index}>
              {problem.rowNumber} 行目: {problem.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const nothingChanges =
    review.added === 0 && review.changed === 0 && review.removed === 0;
  return (
    <div
      role="status"
      style={{
        marginBottom: 12,
        border: `1px solid ${palette.actionBorder}`,
        background: palette.actionBg,
        borderRadius: radii.md,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: fontSize.base, color: palette.text }}>
        {nothingChanges
          ? "取り込んだ CSV は今の仕訳と同じです。"
          : `取り込んだ CSV で仕訳を置き換えます。追加 ${review.added} 件・変更 ${review.changed} 件・削除 ${review.removed} 件 (そのまま ${review.unchanged} 件)`}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <BarButton
          primary={false}
          disabled={review.applying}
          onClick={props.onDismiss}
        >
          {nothingChanges ? "閉じる" : "やめる"}
        </BarButton>
        {nothingChanges ? null : (
          <BarButton primary disabled={review.applying} onClick={props.onApply}>
            {review.applying ? "反映中" : "反映する"}
          </BarButton>
        )}
      </div>
    </div>
  );
}

function JournalTable(props: {
  rows: JournalTableScreenRow[];
  showStatus: boolean;
  onOpenRow: ((row: JournalTableScreenRow) => void) | null;
}) {
  const fields = JOURNAL_TABLE_FIELDS;
  const minWidth =
    fields.reduce((sum, field) => sum + COLUMN_WIDTHS[field], 0) +
    (props.showStatus ? 64 : 0);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 320,
        overflow: "auto",
        background: palette.surface,
        border: `1px solid ${palette.borderEmphasis}`,
        borderRadius: 12,
      }}
    >
      <style>{`
        .bk-journal-table-row.is-clickable { cursor: pointer; }
        .bk-journal-table-row.is-clickable:hover td { background: ${palette.hoverStrong}; }
      `}</style>
      <table
        aria-label="仕訳の表"
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          minWidth,
          width: "100%",
          tableLayout: "fixed",
          fontSize: fontSize.sm,
          color: palette.text,
        }}
      >
        <colgroup>
          {props.showStatus ? <col style={{ width: 64 }} /> : null}
          {fields.map((field) => (
            <col key={field} style={{ width: COLUMN_WIDTHS[field] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {props.showStatus ? (
              <HeaderCell numeric={false}>状態</HeaderCell>
            ) : null}
            {fields.map((field) => (
              <HeaderCell key={field} numeric={NUMERIC_FIELDS.has(field)}>
                {JOURNAL_TABLE_HEADERS[field]}
              </HeaderCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td
                colSpan={fields.length + (props.showStatus ? 1 : 0)}
                style={{
                  padding: "32px 12px",
                  textAlign: "center",
                  color: palette.textLabel,
                }}
              >
                この期間の仕訳はまだありません
              </td>
            </tr>
          ) : (
            props.rows.map((row, index) => {
              const firstOfEntry =
                index === 0 || props.rows[index - 1]?.entryKey !== row.entryKey;
              const clickable = props.onOpenRow != null;
              const status = row.status;
              return (
                <tr
                  key={`${row.entryKey}:${index}`}
                  className={`bk-journal-table-row${clickable ? " is-clickable" : ""}`}
                  onClick={() => props.onOpenRow?.(row)}
                  style={{
                    textDecoration:
                      status === "removed" ? "line-through" : "none",
                    color:
                      status === "removed" ? palette.textLabel : palette.text,
                  }}
                >
                  {props.showStatus ? (
                    <BodyCell
                      numeric={false}
                      firstOfEntry={firstOfEntry}
                      background={
                        status == null ? null : STATUS_COLORS[status].background
                      }
                      title={null}
                    >
                      {status != null && firstOfEntry ? (
                        <span
                          style={{
                            color: STATUS_COLORS[status].text,
                            fontWeight: fontWeight.bold,
                          }}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      ) : null}
                    </BodyCell>
                  ) : null}
                  {fields.map((field) => (
                    <BodyCell
                      key={field}
                      numeric={NUMERIC_FIELDS.has(field)}
                      firstOfEntry={firstOfEntry}
                      background={
                        status == null ? null : STATUS_COLORS[status].background
                      }
                      title={row[field]}
                    >
                      {row[field]}
                    </BodyCell>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell(props: { numeric: boolean; children: ReactNode }) {
  return (
    <th
      scope="col"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        height: sizes.field.height,
        padding: "0 10px",
        background: palette.formGroupBg,
        borderBottom: `1px solid ${palette.borderStrong}`,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        textAlign: props.numeric ? "right" : "left",
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

function BodyCell(props: {
  numeric: boolean;
  firstOfEntry: boolean;
  background: string | null;
  title: string | null;
  children: ReactNode;
}) {
  return (
    <td
      title={props.title ?? ""}
      style={{
        height: 40,
        padding: "0 10px",
        borderTop: props.firstOfEntry
          ? `1px solid ${palette.borderSubtle}`
          : "none",
        background: props.background ?? palette.surface,
        textAlign: props.numeric ? "right" : "left",
        fontVariantNumeric: props.numeric ? "tabular-nums" : "normal",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {props.children}
    </td>
  );
}

function BarButton(props: {
  primary: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        height: sizes.button.compactHeight,
        padding: "0 16px",
        borderRadius: radii.sm,
        border: props.primary ? "none" : `1px solid ${palette.borderStrong}`,
        background: props.primary ? palette.brand : palette.surface,
        color: props.primary ? palette.surface : palette.text,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
      }}
    >
      {props.children}
    </button>
  );
}
