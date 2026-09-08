"use client";

import { useId, useRef, useState } from "react";

import { parseIsoLocalDate } from "@rubydogjp/openkk-client-domain";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
  typography,
} from "./design-tokens.js";
import { useModalLifecycle } from "./dismissible-layer.js";

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

function parseIsoDate(value: string): Date | null {
  return parseIsoLocalDate(value);
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function formatDateButtonLabel(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  if (date == null) return isoDate || "日付を選択";
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const w = WEEKDAY_JP[date.getDay()];
  return `${y}/${mo}/${d} (${w})`;
}

export function isoDateToWeekday(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  if (date == null) return "";
  return WEEKDAY_JP[date.getDay()];
}

export function DatePickerButton(props: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string | null;
  minDate: string | null;
  maxDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const label = formatDateButtonLabel(props.value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={props.ariaLabel ?? undefined}
        style={{
          height: sizes.field.height,
          padding: `0 ${sizes.field.paddingX}`,
          borderRadius: radii.sm,
          border: `1px solid ${palette.action}`,
          background: palette.surface,
          display: "inline-flex",
          alignItems: "center",
          gap: spacing.s8,
          cursor: "pointer",

          flexShrink: 0,
          whiteSpace: "nowrap",

          alignSelf: "flex-start",
        }}
      >
        <CalendarIcon size={16} color={palette.action} />
        <span
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            color: palette.action,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </button>
      {open ? (
        <DatePickerDialog
          value={props.value}
          minDate={props.minDate}
          maxDate={props.maxDate}
          onConfirm={(v) => {
            props.onChange(v);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function DatePickerDialog(props: {
  value: string;
  minDate: string | null;
  maxDate: string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalLifecycle<HTMLDivElement>(
    props.onCancel,
    cancelButtonRef,
  );
  const minDate = props.minDate == null ? null : parseIsoDate(props.minDate);
  const maxDate = props.maxDate == null ? null : parseIsoDate(props.maxDate);
  const initial = clampDateToBounds(
    parseIsoDate(props.value) ?? new Date(),
    minDate,
    maxDate,
  );
  const [selected, setSelected] = useState<Date>(initial);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (day: number) =>
    selected.getFullYear() === viewYear &&
    selected.getMonth() === viewMonth &&
    selected.getDate() === day;

  const isAllowed = (date: Date) =>
    (minDate == null || date >= minDate) &&
    (maxDate == null || date <= maxDate);

  const canGoPrev =
    minDate == null ||
    viewYear > minDate.getFullYear() ||
    (viewYear === minDate.getFullYear() && viewMonth > minDate.getMonth());
  const canGoNext =
    maxDate == null ||
    viewYear < maxDate.getFullYear() ||
    (viewYear === maxDate.getFullYear() && viewMonth < maxDate.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((year) => year - 1);
      setViewMonth(11);
    } else {
      setViewMonth((month) => month - 1);
    }
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((year) => year + 1);
      setViewMonth(0);
    } else {
      setViewMonth((month) => month + 1);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          background: palette.surface,
          borderRadius: 24,
          maxWidth: 460,
          width: "calc(100% - 48px)",
          padding: "22px 24px",
          display: "grid",
          gap: 16,
        }}
      >

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: palette.action,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <CalendarIcon size={26} color={palette.surface} />
          </div>
          <div>
            <div
              id={titleId}
              style={{
                fontSize: typography.sectionTitle.fontSize,
                fontWeight: fontWeight.bold,
                color: palette.text,
              }}
            >
              日付を選択
            </div>
            <div style={{ fontSize: fontSize.base, color: palette.textSoft, marginTop: 2 }}>
              {formatDateButtonLabel(toIsoDate(selected))}
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${palette.borderSubtle}`,
            background: palette.formGroupBg,
            padding: "12px 14px",
          }}
        >

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              onClick={prevMonth}
              disabled={!canGoPrev}
              aria-label="前の月"
              style={{
                ...navBtnStyle,
                opacity: canGoPrev ? 1 : 0.35,
                cursor: canGoPrev ? "pointer" : "default",
              }}
            >
              ‹
            </button>
            <span
              style={{
                fontSize: fontSize.md,
                fontWeight: fontWeight.bold,
                color: palette.text,
              }}
            >
              {viewYear}年{viewMonth + 1}月
            </span>
            <button
              type="button"
              onClick={nextMonth}
              disabled={!canGoNext}
              aria-label="次の月"
              style={{
                ...navBtnStyle,
                opacity: canGoNext ? 1 : 0.35,
                cursor: canGoNext ? "pointer" : "default",
              }}
            >
              ›
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              marginBottom: 4,
            }}
          >
            {WEEKDAY_JP.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: "center",
                  fontSize: fontSize.xs,
                  fontWeight: fontWeight.bold,
                  color: palette.textMuted,
                  padding: "4px 0",
                }}
              >
                {w}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) => {
              if (day == null) return <div key={`e${i}`} style={{ aspectRatio: "1" }} />;
              const sel = isSelected(day);
              const candidate = new Date(viewYear, viewMonth, day);
              const allowed = isAllowed(candidate);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(candidate)}
                  disabled={!allowed}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 999,
                    border: "none",
                    background: sel ? palette.action : "transparent",
                    color: sel
                      ? palette.surface
                      : allowed
                        ? palette.textSoft
                        : palette.textMuted,
                    fontSize: fontSize.base,
                    fontWeight: sel ? fontWeight.bold : fontWeight.medium,
                    cursor: allowed ? "pointer" : "default",
                    opacity: allowed ? 1 : 0.35,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={props.onCancel}
            style={cancelBtnStyle}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => props.onConfirm(toIsoDate(selected))}
            style={confirmBtnStyle}
          >
            選択する
          </button>
        </div>
      </div>
    </div>
  );
}

function clampDateToBounds(
  date: Date,
  minDate: Date | null,
  maxDate: Date | null,
): Date {
  if (minDate != null && date < minDate) return new Date(minDate);
  if (maxDate != null && date > maxDate) return new Date(maxDate);
  return date;
}

function CalendarIcon(props: { size: number; color: string }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none">
      <rect x={3} y={4} width={18} height={18} rx={3} stroke={props.color} strokeWidth={2} />
      <path d="M3 9h18" stroke={props.color} strokeWidth={1.5} />
      <path d="M8 2v4M16 2v4" stroke={props.color} strokeWidth={2} strokeLinecap="round" />
      <rect x={7} y={12} width={3} height={3} rx={0.5} fill={props.color} />
      <rect x={11} y={12} width={3} height={3} rx={0.5} fill={props.color} />
      <rect x={15} y={12} width={3} height={3} rx={0.5} fill={props.color} />
      <rect x={7} y={17} width={3} height={2.5} rx={0.5} fill={props.color} />
      <rect x={11} y={17} width={3} height={2.5} rx={0.5} fill={props.color} />
    </svg>
  );
}

const navBtnStyle = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: `1px solid ${palette.borderSubtle}`,
  background: palette.surface,
  fontSize: fontSize.xl,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: palette.textSoft,
} as const;

const cancelBtnStyle = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.surface,
  color: palette.textSoft,
  ...typography.control,
  cursor: "pointer",
} as const;

const confirmBtnStyle = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formPrimaryMinWidth,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: "none",
  background: palette.action,
  color: palette.surface,
  ...typography.control,
  cursor: "pointer",
} as const;
