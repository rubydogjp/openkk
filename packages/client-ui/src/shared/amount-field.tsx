"use client";

import { useState, type ReactNode } from "react";

import { fontFamily, fontWeight, palette, radii, sizes, typography } from "./design-tokens";

const AMOUNT_FONT = {
  ...typography.amount,
  fontFamily: fontFamily.mono,
  fontVariantNumeric: "tabular-nums" as const,
  textAlign: "right" as const,
};

export function AmountText({
  children,
  bold = false,
  muted = false,
}: {
  children: ReactNode;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      style={{
        ...AMOUNT_FONT,
        fontWeight: bold ? fontWeight.bold : fontWeight.semibold,
        color: muted ? palette.textMuted : palette.text,
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
  ariaLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused ? value.replace(/,/g, "") : formatGrouped(value);
  return (
    <input
      className="bk-amount-input"
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onChange(formatGrouped(value));
      }}
      onChange={(event) => {
        const cleaned = event.target.value.replace(/[^\d]/g, "");
        onChange(cleaned);
      }}
      style={{
        ...AMOUNT_FONT,
        height: sizes.field.height,
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: radii.sm,
        background: palette.surface,
        padding: `0 ${sizes.field.paddingX}px`,
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
        padding: `0 ${sizes.field.paddingX}px`,
        color: palette.textMuted,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      {value}
    </div>
  );
}

export function formatGrouped(value: string): string {
  const digitsOnly = (value ?? "").replace(/[^\d-]/g, "");
  if (digitsOnly === "" || digitsOnly === "-") return "";
  const n = parseInt(digitsOnly, 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("ja-JP");
}
