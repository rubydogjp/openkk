"use client";

import type { CSSProperties, ReactNode } from "react";

import { MAX_TEXT_FIELD_LENGTH } from "@rubydogjp/openkk-client-domain";
import { fontWeight, palette, radii, rings, shadows, sizes, spacing, typography } from "./design-tokens.js";
import { DatePickerButton, formatDateButtonLabel } from "./date-picker.js";

const inputClassName = "bk-form-input";

const formInputStyles = `
  .${inputClassName} { box-shadow: ${shadows.inputInset}; transition: border-color 80ms ease; }
  .${inputClassName}:focus { border-color: ${palette.brand} !important; box-shadow: ${rings.brandFocus}, ${shadows.inputInset}; }
`;

export function FormStyles() {

  return <style>{formInputStyles}</style>;
}

export function FormStack({
  gap,
  children,
}: {
  gap: number | string | null;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: gap ?? spacing.s28,
      }}
    >
      {children}
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column" }}>
      <span
        style={{
          marginBottom: spacing.s8,
          color: palette.textLabel,
          letterSpacing: "0.01em",
          ...typography.label,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function FormTextInput({
  value,
  onChange,
  readOnly,
  width,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  width: number | null;
  placeholder: string | null;
}) {
  return (
    <input
      className={inputClassName}
      value={value}
      readOnly={readOnly}
      maxLength={MAX_TEXT_FIELD_LENGTH}
      placeholder={placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value)}
      style={{
        height: sizes.field.height,
        width: width ?? "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: radii.sm,
        background: readOnly ? palette.pageBg : palette.surface,

        color: readOnly ? palette.textMuted : palette.text,
        padding: `0 ${sizes.field.paddingX}`,
        ...typography.input,
        outline: "none",
      }}
    />
  );
}

export function FormReadOnlyValue({
  children,
  width,
}: {
  children: ReactNode;
  width: number | null;
}) {
  return (
    <div
      style={{
        height: sizes.field.height,
        width: width ?? "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: radii.sm,
        background: palette.pageBg,

        color: palette.textMuted,
        padding: `0 ${sizes.field.paddingX}`,
        display: "flex",
        alignItems: "center",
        ...typography.input,
      }}
    >
      {children}
    </div>
  );
}

export function FormDatePair({
  start,
  end,
  onChangeStart,
  onChangeEnd,
  readOnly,
}: {
  start: string;
  end: string;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: spacing.s10 }}>
      {readOnly ? (
        <ReadOnlyDate value={start} />
      ) : (
        <DatePickerButton value={start} onChange={onChangeStart} ariaLabel={null} minDate={null} maxDate={null} />
      )}
      <span style={{ color: palette.textLabel, ...typography.control }}>〜</span>
      {readOnly ? (
        <ReadOnlyDate value={end} />
      ) : (
        <DatePickerButton value={end} onChange={onChangeEnd} ariaLabel={null} minDate={null} maxDate={null} />
      )}
    </div>
  );
}

function ReadOnlyDate({ value }: { value: string }) {
  return (
    <div
      style={{
        height: sizes.field.height,
        borderRadius: radii.sm,
        border: `1px solid ${palette.borderSubtle}`,
        background: palette.pageBg,
        padding: `0 ${sizes.field.paddingX}`,
        display: "inline-flex",
        alignItems: "center",
        color: palette.textMuted,
        ...typography.control,
      }}
    >
      {formatDateButtonLabel(value)}
    </div>
  );
}

export function FormErrorText({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: `${spacing.s12} 0 0`,
        color: palette.danger,
        ...typography.helper,
        fontWeight: fontWeight.semibold,
      }}
    >
      {children}
    </p>
  );
}

export function FormActions({
  align,
  children,
}: {
  align: "start" | "end" | null;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: spacing.s12,
        display: "flex",
        justifyContent: align !== "start" ? "flex-end" : "flex-start",
        gap: spacing.s10,
      }}
    >
      {children}
    </div>
  );
}

const baseButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formPrimaryMinWidth,
  padding: "0 18px",
  borderRadius: radii.sm,
  cursor: "pointer",
  border: "none",
  ...typography.control,
  fontWeight: fontWeight.bold,
};

export function FormPrimaryButton({
  children,
  onClick,
  disabled,
  type,
  variant = "primary",
  icon,
}: {
  children: ReactNode;
  onClick: (() => void) | null;
  disabled: boolean;
  type: "button" | "submit" | null;

  variant: "primary" | "success" | null;

  icon: ReactNode | null;
}) {
  const isDisabled = disabled;
  const bg = variant === "success" ? palette.success : palette.brand;
  const shadow =
    variant === "success"
      ? "0 1px 2px rgba(5, 150, 105, 0.28)"
      : shadows.primaryButton;
  return (
    <button
      type={type ?? "button"}
      onClick={onClick ?? undefined}
      disabled={isDisabled}
      style={{
        ...baseButtonStyle,
        background: bg,
        color: palette.surface,
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? "default" : "pointer",
        boxShadow: isDisabled ? "none" : shadow,
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s8,
      }}
    >
      {icon != null ? (
        <span style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export function FormSecondaryButton({
  children,
  onClick,
  disabled,
  type,
}: {
  children: ReactNode;
  onClick: (() => void) | null;
  disabled: boolean;
  type: "button" | "submit" | null;
}) {
  const isDisabled = disabled;
  return (
    <button
      type={type ?? "button"}
      onClick={onClick ?? undefined}
      disabled={isDisabled}
      style={{
        ...baseButtonStyle,
        minWidth: sizes.button.formSecondaryMinWidth,
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.borderStrong}`,
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
