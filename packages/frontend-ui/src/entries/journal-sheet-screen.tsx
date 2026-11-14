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

export type JournalSheetRowStatus = "added" | "changed" | "removed";

export type JournalSheetRow = JournalTableRow & {
  entryKey: string;
  status: JournalSheetRowStatus | null;
};

export type JournalSheetReview =
  | {
      kind: "changes";
      added: number;
      changed: number;
      removed: number;
      unchanged: number;
      applying: boolean;
    }
  | { kind: "problems"; problems: JournalTableProblem[] };

const STATUS_LABELS: Record<JournalSheetRowStatus, string> = {
  added: "追加",
  changed: "変更",
  removed: "削除",
};

const STATUS_COLORS: Record<
  JournalSheetRowStatus,
  { background: string; text: string }
> = {
  added: { background: palette.successBg, text: palette.success },
  changed: { background: palette.warningBg, text: palette.warning },
  removed: { background: palette.dangerBg, text: palette.danger },
};

const AMOUNT_FIELDS = new Set<keyof JournalTableRow>([
  "debitAmount",
  "creditAmount",
]);

const NUMERIC_FIELDS = new Set<keyof JournalTableRow>([
  ...AMOUNT_FIELDS,
  "businessRate",
]);

const COLUMN_WIDTHS: Record<keyof JournalTableRow, number> = {
  entryNumber: 132,
  date: 104,
  debitAccount: 150,
  debitAmount: 104,
  creditAccount: 150,
  creditAmount: 104,
  description: 240,
  partner: 150,
  taxCategory: 130,
  businessCategory: 130,
  businessRate: 84,
};

const SHEET_HEADING_COLOR = palette.success;
const SHEET_HEADING_TEXT_COLOR = palette.surface;
const SHEET_GRID_COLOR = palette.borderStrong;
const SHEET_BAR_HEIGHT = 52;
const SHEET_ROW_HEIGHT = 32;
const COLUMN_LETTER_ROW_HEIGHT = 24;
const ROW_NUMBER_COLUMN_WIDTH = 44;
const STATUS_COLUMN_WIDTH = 64;
const FIELD_NAME_ROW_NUMBER = 1;
const FIRST_ENTRY_ROW_NUMBER = 2;
const WHOLE_AMOUNT_PATTERN = /^\d+$/;
const FIRST_COLUMN_LETTER_CODE = "A".charCodeAt(0);

function columnLetter(index: number): string {
  return String.fromCharCode(FIRST_COLUMN_LETTER_CODE + index);
}

function shownCellText(field: keyof JournalTableRow, text: string): string {
  return AMOUNT_FIELDS.has(field) && WHOLE_AMOUNT_PATTERN.test(text)
    ? Number(text).toLocaleString("ja-JP")
    : text;
}

export function JournalSheetScreen(props: {
  fiscalPeriodName: string;
  saveControl: ReactNode;
  rows: JournalSheetRow[];
  review: JournalSheetReview | null;
  lockedMessage: PeriodLockMessage | null;
  onBack: () => void;
  onImportFile: ((kind: EntryFileKind, file: File) => void) | null;
  onExport: ((kind: EntryFileKind) => void) | null;
  onOpenRow: ((row: JournalSheetRow) => void) | null;
  onApplyReview: () => void;
  onDismissReview: () => void;
}) {
  const reviewing = props.review != null;
  return (
    <section
      aria-label="シート"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        background: palette.surface,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          height: SHEET_BAR_HEIGHT,
          padding: "0 12px 0 4px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: `1px solid ${SHEET_GRID_COLOR}`,
        }}
      >
        <button
          type="button"
          className="bk-sheet-back"
          onClick={props.onBack}
          style={{
            flexShrink: 0,
            height: sizes.button.compactHeight,
            padding: "0 10px 0 4px",
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            border: "none",
            borderRadius: radii.sm,
            color: palette.textSoft,
            fontSize: fontSize.base,
            fontWeight: fontWeight.bold,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <BackChevron />
          月ごと
        </button>
        <h1
          style={{
            flexShrink: 0,
            margin: 0,
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: palette.text,
            whiteSpace: "nowrap",
          }}
        >
          シート
        </h1>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: fontSize.base,
            color: palette.textSoft,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {props.fiscalPeriodName}
        </span>
        {props.saveControl}
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
        <div style={{ padding: spacing.s24 }}>
          <ClosedPeriodLock
            title={props.lockedMessage.title}
            description={props.lockedMessage.description}
          />
        </div>
      ) : (
        <>
          {props.review != null ? (
            <div style={{ flexShrink: 0, padding: "12px 12px 0" }}>
              <ReviewBar
                review={props.review}
                onApply={props.onApplyReview}
                onDismiss={props.onDismissReview}
              />
            </div>
          ) : null}
          {props.review?.kind === "problems" ? null : (
            <JournalSheet
              rows={props.rows}
              showStatus={reviewing}
              onOpenRow={reviewing ? null : props.onOpenRow}
            />
          )}
        </>
      )}
    </section>
  );
}

function BackChevron() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline
        points="14 6 8 12 14 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReviewBar(props: {
  review: JournalSheetReview;
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

function JournalSheet(props: {
  rows: JournalSheetRow[];
  showStatus: boolean;
  onOpenRow: ((row: JournalSheetRow) => void) | null;
}) {
  const fields = JOURNAL_TABLE_FIELDS;
  const minWidth =
    ROW_NUMBER_COLUMN_WIDTH +
    fields.reduce((sum, field) => sum + COLUMN_WIDTHS[field], 0) +
    (props.showStatus ? STATUS_COLUMN_WIDTH : 0);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        background: palette.surface,
      }}
    >
      <table
        aria-label="仕訳のシート"
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          minWidth,
          width: "100%",
          tableLayout: "fixed",
          fontSize: fontSize.base,
          color: palette.text,
        }}
      >
        <colgroup>
          <col style={{ width: ROW_NUMBER_COLUMN_WIDTH }} />
          {props.showStatus ? (
            <col style={{ width: STATUS_COLUMN_WIDTH }} />
          ) : null}
          {fields.map((field) => (
            <col key={field} style={{ width: COLUMN_WIDTHS[field] }} />
          ))}
        </colgroup>
        <thead>
          <tr aria-hidden="true">
            <SheetHeadingCell corner top={0}>
              {null}
            </SheetHeadingCell>
            {props.showStatus ? (
              <SheetHeadingCell corner={false} top={0}>
                {null}
              </SheetHeadingCell>
            ) : null}
            {fields.map((field, index) => (
              <SheetHeadingCell key={field} corner={false} top={0}>
                {columnLetter(index)}
              </SheetHeadingCell>
            ))}
          </tr>
          <tr>
            <RowNumberCell top={COLUMN_LETTER_ROW_HEIGHT}>
              {FIELD_NAME_ROW_NUMBER}
            </RowNumberCell>
            {props.showStatus ? (
              <FieldNameCell numeric={false}>状態</FieldNameCell>
            ) : null}
            {fields.map((field) => (
              <FieldNameCell key={field} numeric={NUMERIC_FIELDS.has(field)}>
                {JOURNAL_TABLE_HEADERS[field]}
              </FieldNameCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <RowNumberCell top={null}>{FIRST_ENTRY_ROW_NUMBER}</RowNumberCell>
              <td
                colSpan={fields.length + (props.showStatus ? 1 : 0)}
                style={{
                  height: SHEET_ROW_HEIGHT,
                  padding: "0 8px",
                  color: palette.textLabel,
                  borderBottom: `1px solid ${SHEET_GRID_COLOR}`,
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
              const background =
                status == null ? null : STATUS_COLORS[status].background;
              return (
                <tr
                  key={`${row.entryKey}:${index}`}
                  className={`bk-sheet-row${clickable ? " is-clickable" : ""}`}
                  onClick={() => props.onOpenRow?.(row)}
                  style={{
                    textDecoration:
                      status === "removed" ? "line-through" : "none",
                    color:
                      status === "removed" ? palette.textLabel : palette.text,
                  }}
                >
                  <RowNumberCell top={null}>
                    {index + FIRST_ENTRY_ROW_NUMBER}
                  </RowNumberCell>
                  {props.showStatus ? (
                    <SheetCell
                      numeric={false}
                      background={background}
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
                    </SheetCell>
                  ) : null}
                  {fields.map((field) => {
                    const text = shownCellText(field, row[field]);
                    return (
                      <SheetCell
                        key={field}
                        numeric={NUMERIC_FIELDS.has(field)}
                        background={background}
                        title={text}
                      >
                        {text}
                      </SheetCell>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SheetHeadingCell(props: {
  corner: boolean;
  top: number;
  children: ReactNode;
}) {
  return (
    <th
      style={{
        position: "sticky",
        top: props.top,
        left: props.corner ? 0 : "auto",
        zIndex: props.corner ? 3 : 2,
        height: COLUMN_LETTER_ROW_HEIGHT,
        padding: 0,
        background: SHEET_HEADING_COLOR,
        color: SHEET_HEADING_TEXT_COLOR,
        borderRight: `1px solid ${SHEET_HEADING_TEXT_COLOR}`,
        borderBottom: `1px solid ${SHEET_HEADING_TEXT_COLOR}`,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        textAlign: "center",
      }}
    >
      {props.children}
    </th>
  );
}

function RowNumberCell(props: { top: number | null; children: number }) {
  return (
    <th
      scope="row"
      style={{
        position: "sticky",
        left: 0,
        top: props.top ?? "auto",
        zIndex: props.top == null ? 1 : 3,
        height: SHEET_ROW_HEIGHT,
        padding: 0,
        background: SHEET_HEADING_COLOR,
        color: SHEET_HEADING_TEXT_COLOR,
        borderRight: `1px solid ${SHEET_HEADING_TEXT_COLOR}`,
        borderBottom: `1px solid ${SHEET_HEADING_TEXT_COLOR}`,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        fontVariantNumeric: "tabular-nums",
        textAlign: "center",
      }}
    >
      {props.children}
    </th>
  );
}

function FieldNameCell(props: { numeric: boolean; children: ReactNode }) {
  return (
    <th
      scope="col"
      style={{
        position: "sticky",
        top: COLUMN_LETTER_ROW_HEIGHT,
        zIndex: 2,
        height: SHEET_ROW_HEIGHT,
        padding: "0 8px",
        background: palette.surface,
        borderRight: `1px solid ${SHEET_GRID_COLOR}`,
        borderBottom: `1px solid ${SHEET_GRID_COLOR}`,
        fontWeight: fontWeight.bold,
        textAlign: props.numeric ? "right" : "left",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {props.children}
    </th>
  );
}

function SheetCell(props: {
  numeric: boolean;
  background: string | null;
  title: string | null;
  children: ReactNode;
}) {
  return (
    <td
      title={props.title ?? ""}
      style={{
        height: SHEET_ROW_HEIGHT,
        padding: "0 8px",
        borderRight: `1px solid ${SHEET_GRID_COLOR}`,
        borderBottom: `1px solid ${SHEET_GRID_COLOR}`,
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
