"use client";

import type { ReactNode } from "react";

import { fontSize, fontWeight, palette, radii, shadows, sizes, spacing, typography } from "../shared/design-tokens.js";

export type StatusChipTone = "brand" | "success" | "muted" | "warning";

const STATUS_TONE_MAP: Record<StatusChipTone, { bg: string; fg: string }> = {
  brand: { bg: palette.brandTint, fg: palette.brand },
  success: { bg: "#DCFCE7", fg: palette.success },
  muted: { bg: palette.formGroupBg, fg: palette.textMuted },
  warning: { bg: palette.warningBg, fg: palette.warning },
};

export function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: StatusChipTone;
}) {
  const c = STATUS_TONE_MAP[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 12px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: fontSize.sm,
        fontWeight: fontWeight.bold,
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </span>
  );
}

export function StepMetaCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: palette.formGroupBg,
        borderRadius: 10,
        padding: "4px 18px",
      }}
    >
      {children}
    </div>
  );
}

export function StepMetaRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: ReactNode;
  divider: boolean;
}) {
  return (
    <>
      {divider ? (
        <div style={{ height: 1, background: palette.borderSubtle }} />
      ) : null}

      <div className="bk-step-row bk-step-row--center" style={{ minHeight: 56 }}>
        <div
          className="bk-step-row-label"
          style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: palette.textLabel }}
        >
          {label}
        </div>
        <div
          style={{

            fontSize: fontSize.base,
            fontWeight: fontWeight.medium,
            color: palette.text,
            lineHeight: 1.5,
          }}
        >
          {value}
        </div>
      </div>
    </>
  );
}

export function StepSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: "0 0 16px",
        padding: "0 0 6px",
        borderBottom: `1px solid ${palette.hairline}`,
        fontSize: typography.sectionTitle.fontSize,
        fontWeight: fontWeight.bold,
        color: palette.text,
        lineHeight: 1.4,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </h2>
  );
}

export function StepDivider({ marginY }: { marginY: number | null }) {
  return <div style={{ height: marginY ?? 28 }} />;
}

type StepCalloutTone = "action" | "info" | "warning" | "alert";

const STEP_CALLOUT_TONE: Record<
  StepCalloutTone,
  { bg: string; border: string; fg: string; icon: string }
> = {
  action: {
    bg: palette.actionBg,
    border: palette.actionBorder,
    fg: palette.action,
    icon: "/icons/action.svg",
  },
  info: {
    bg: palette.successBg,
    border: palette.successBorder,
    fg: palette.success,
    icon: "/icons/success.svg",
  },
  warning: {
    bg: palette.warningBg,
    border: palette.warningBorder,
    fg: palette.warning,
    icon: "/icons/warning.svg",
  },
  alert: {
    bg: palette.dangerBg,
    border: palette.dangerBorder,
    fg: palette.danger,
    icon: "/icons/failed.svg",
  },
};

export function StepCallout({
  children,
  tone,
}: {
  children: ReactNode;
  tone: StepCalloutTone | null;
}) {
  const style = STEP_CALLOUT_TONE[tone ?? "action"];
  return (
    <div
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 14,
        padding: "14px 18px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          marginTop: 2,
          display: "block",
          backgroundColor: style.fg,
          maskImage: `url('${style.icon}')`,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskImage: `url('${style.icon}')`,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
        }}
      />
      <div
        style={{

          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: fontSize.base,
          color: palette.text,
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ActionChoiceCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: palette.text }}>
          {title}
        </div>
      </div>
      <div
        style={{
          fontSize: fontSize.sm,
          color: palette.textSoft,
          lineHeight: 1.65,
          flex: 1,
        }}
      >
        {description}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 4,
        }}
      >
        {action}
      </div>
    </div>
  );
}

export function ActionGrid({
  columns,
  children,
}: {
  columns: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns === 2 ? "1fr 1fr" : "1fr",
        gap: 14,
        alignItems: "stretch",
      }}
    >
      {children}
    </div>
  );
}

export function StepFormRow({
  label,
  control,
  hint,
  divider,
}: {
  label: string;
  control: ReactNode;
  hint: ReactNode | null;
  divider: boolean;
}) {
  return (
    <>
      {divider ? (
        <div style={{ height: 1, background: palette.borderSubtle }} />
      ) : null}

      <div className="bk-step-row">
        <div
          className="bk-step-row-label"
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            color: palette.textLabel,
            paddingTop: 11,
            lineHeight: 1.4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 0,
          }}
        >
          {control}
          {hint != null ? (
            <div
              style={{
                fontSize: fontSize.sm,
                color: palette.textMuted,
                lineHeight: 1.6,
                fontWeight: fontWeight.regular,
                paddingTop: 2,
              }}
            >
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function StepPrimaryButton({
  onClick,
  children,
  disabled,
  variant = "primary",
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled: boolean;
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
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{
        height: sizes.button.compactHeight,
        minWidth: icon != null ? sizes.button.compactIconTextMinWidth : sizes.button.compactMinWidth,
        padding: "0 16px",
        borderRadius: radii.sm,
        border: "none",
        background: bg,
        color: palette.surface,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        boxShadow: isDisabled ? "none" : shadow,
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s8,
      }}
    >
      {icon != null ? (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export function StepSecondaryButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled: boolean;
}) {
  const isDisabled = disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactMinWidth,
        padding: "0 16px",
        borderRadius: radii.sm,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        color: palette.text,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: isDisabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function UndoIcon({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 14L4 9l5-5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayIcon({ color }: { color: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill={color} aria-hidden>
      <polygon points="7 5 19 12 7 19" />
    </svg>
  );
}
