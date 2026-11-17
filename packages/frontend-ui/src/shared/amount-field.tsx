"use client";

import { useState, type ReactNode } from "react";

import {
  formatAmount,
  isWholeAmountText,
  normalizeAmountInput,
} from "@rubydogjp/openkk-driver";

import {
  fontFamily,
  fontWeight,
  palette,
  radii,
  sizes,
  typography,
} from "./design-tokens.js";

const AMOUNT_FONT = {
  ...typography.amount,
  fontFamily: fontFamily.mono,
  fontVariantNumeric: "tabular-nums" as const,
  textAlign: "right" as const,
};

export function AmountText({
  children,
  bold,
}: {
  children: ReactNode;
  bold: boolean;
}) {
  return (
    <span
      style={{
        ...AMOUNT_FONT,
        fontWeight: bold ? fontWeight.bold : fontWeight.semibold,
        color: palette.text,
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

export function AmountInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (raw: string) => void;
  ariaLabel: string | null;
}) {
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const display = focused ? value.replace(/,/g, "") : formatGrouped(value);
  return (
    <input
      className="bk-amount-input"
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel ?? undefined}
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onChange(formatGrouped(value));
      }}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(event) => {
        setComposing(false);
        onChange(amountInputValue(event.currentTarget.value, false));
      }}
      onChange={(event) => {
        onChange(amountInputValue(event.target.value, composing));
      }}
      style={{
        ...AMOUNT_FONT,
        height: sizes.field.height,
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${palette.borderInput}`,
        borderRadius: radii.sm,
        background: palette.surface,
        padding: `0 ${sizes.field.paddingX}`,
        color: palette.text,
        outline: "none",
      }}
    />
  );
}

export function AmountReadOnlyField({ value }: { value: string }) {
  return (
    <div
      style={{
        ...AMOUNT_FONT,
        height: sizes.field.height,
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: radii.sm,
        background: palette.surface,
        padding: `0 ${sizes.field.paddingX}`,
        color: palette.textLabel,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      {value}
    </div>
  );
}

export function amountInputValue(raw: string, composing: boolean): string {
  return composing ? raw : normalizeAmountInput(raw);
}

export function formatGrouped(value: string): string {
  if (!isWholeAmountText(value)) return value;
  const digits = value.replaceAll(",", "").trim();
  if (digits === "") return "";
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? formatAmount(amount) : digits;
}
