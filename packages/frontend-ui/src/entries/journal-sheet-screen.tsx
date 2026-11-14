"use client";

import type { ReactNode } from "react";

import {
  JOURNAL_TABLE_FIELDS,
  JOURNAL_TABLE_HEADERS,
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

export type JournalSheetRow = JournalTableRow & {
  entryKey: string;
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
  lockedMessage: PeriodLockMessage | null;
  onBack: () => void;
  onImportFile: ((kind: EntryFileKind, file: File) => void) | null;
  onExport: ((kind: EntryFileKind) => void) | null;
  onOpenRow: ((row: JournalSheetRow) => void) | null;
}) {
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
          className="bk-sheet-back bk-narrow-icon-only"
          onClick={props.onBack}
          aria-label="月ごと"
          style={{
            flexShrink: 0,
            height: sizes.button.compactHeight,
            padding: "0 10px 0 4px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
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
          <span className="bk-button-label">月ごと</span>
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
          className="bk-sheet-period-name"
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
        <JournalSheet rows={props.rows} onOpenRow={props.onOpenRow} />
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

function JournalSheet(props: {
  rows: JournalSheetRow[];
  onOpenRow: ((row: JournalSheetRow) => void) | null;
}) {
  const fields = JOURNAL_TABLE_FIELDS;
  const sheetWidth =
    ROW_NUMBER_COLUMN_WIDTH +
    fields.reduce((sum, field) => sum + COLUMN_WIDTHS[field], 0);
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
          width: sheetWidth,
          tableLayout: "fixed",
          fontSize: fontSize.base,
          color: palette.text,
        }}
      >
        <colgroup>
          <col style={{ width: ROW_NUMBER_COLUMN_WIDTH }} />
          {fields.map((field) => (
            <col key={field} style={{ width: COLUMN_WIDTHS[field] }} />
          ))}
        </colgroup>
        <thead>
          <tr aria-hidden="true">
            <SheetHeadingCell corner top={0}>
              {null}
            </SheetHeadingCell>
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
                colSpan={fields.length}
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
            props.rows.map((row, index) => (
              <tr
                key={`${row.entryKey}:${index}`}
                className={`bk-sheet-row${props.onOpenRow != null ? " is-clickable" : ""}`}
                onClick={() => props.onOpenRow?.(row)}
              >
                <RowNumberCell top={null}>
                  {index + FIRST_ENTRY_ROW_NUMBER}
                </RowNumberCell>
                {fields.map((field) => {
                  const text = shownCellText(field, row[field]);
                  return (
                    <SheetCell
                      key={field}
                      numeric={NUMERIC_FIELDS.has(field)}
                      title={text}
                    >
                      {text}
                    </SheetCell>
                  );
                })}
              </tr>
            ))
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
  title: string;
  children: ReactNode;
}) {
  return (
    <td
      title={props.title}
      style={{
        height: SHEET_ROW_HEIGHT,
        padding: "0 8px",
        borderRight: `1px solid ${SHEET_GRID_COLOR}`,
        borderBottom: `1px solid ${SHEET_GRID_COLOR}`,
        background: palette.surface,
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
