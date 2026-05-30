"use client";

import type { CSSProperties, ReactNode } from "react";

import { fontWeight, palette, radii, rings, shadows, sizes, spacing, typography } from "./design-tokens";
import { DatePickerButton, formatDateButtonLabel } from "./date-picker";

const inputClassName = "bk-form-input";

const formInputStyles = `
  .${inputClassName} { box-shadow: ${shadows.inputInset}; transition: border-color 80ms ease; }
  .${inputClassName}:focus { border-color: ${palette.brand} !important; box-shadow: ${rings.brandFocus}, ${shadows.inputInset}; }
`;

export function FormStyles() {

  return <style>{formInputStyles}</style>;
}

export function FormStack({
  gap = spacing.s28,
  children,
}: {
  gap?: number;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>{children}</div>
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
  readOnly = false,
  width,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  width?: number;
  placeholder?: string;
}) {
  return (
    <input
      className={inputClassName}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
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
        padding: `0 ${sizes.field.paddingX}px`,
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
  width?: number;
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
        padding: `0 ${sizes.field.paddingX}px`,
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
  readOnly = false,
}: {
  start: string;
  end: string;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: spacing.s10 }}>
      {readOnly ? (
        <ReadOnlyDate value={start} />
      ) : (
        <DatePickerButton value={start} onChange={onChangeStart} />
      )}
      <span style={{ color: palette.textLabel, ...typography.control }}>〜</span>
      {readOnly ? (
        <ReadOnlyDate value={end} />
      ) : (
        <DatePickerButton value={end} onChange={onChangeEnd} />
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
        padding: `0 ${sizes.field.paddingX}px`,
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

export function FormHelpText({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: `${spacing.s12}px 0 0`,
        color: palette.textMuted,
        ...typography.helper,
      }}
    >
      {children}
    </p>
  );
}

export function FormErrorText({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: `${spacing.s12}px 0 0`,
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
  align = "end",
  children,
}: {
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: spacing.s12,
        display: "flex",
        justifyContent: align === "end" ? "flex-end" : "flex-start",
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
  disabled = false,
  type = "button",
  variant = "primary",
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";

  variant?: "primary" | "success";

  icon?: ReactNode;
}) {
  const bg = variant === "success" ? palette.success : palette.brand;
  const shadow =
    variant === "success"
      ? "0 1px 2px rgba(5, 150, 105, 0.28)"
      : shadows.primaryButton;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseButtonStyle,
        background: bg,
        color: palette.surface,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        boxShadow: disabled ? "none" : shadow,
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
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseButtonStyle,
        minWidth: sizes.button.formSecondaryMinWidth,
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.borderStrong}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
