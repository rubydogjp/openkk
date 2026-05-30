"use client";

import type { CSSProperties, ReactNode } from "react";

import { fontSize, fontWeight, palette, radii, sizes, spacing, typography } from "./design-tokens";

export function DemoIcon({
  size = 20,
  opacity = 1,
}: {
  size?: number;
  opacity?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 248 248"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity, display: "block" }}
      aria-hidden="true"
    >
      <g transform="translate(-516 -236)">
        <path
          d="M640 256.667C588.638 256.667 547 298.304 547 349.667L547 463.333 578 432.333 609 463.333 640 432.333 671 463.333 702 432.333 733 463.333 733 349.667C733 298.304 691.363 256.667 640 256.667M609 318.667C620.414 318.667 629.667 327.919 629.667 339.333 629.667 350.748 620.414 360 609 360 597.586 360 588.333 350.748 588.333 339.333 588.333 327.919 597.586 318.667 609 318.667M671 318.667C682.414 318.667 691.667 327.919 691.667 339.333 691.667 350.748 682.414 360 671 360 659.586 360 650.333 350.748 650.333 339.333 650.333 327.919 659.586 318.667 671 318.667Z"
          fill={palette.danger}
          fillRule="nonzero"
        />
      </g>
    </svg>
  );
}

export function DemoLockButton({
  label = "デモ版ではこの操作はできません",
  style,
}: {
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      disabled
      style={{
        height: sizes.button.formHeight,
        minWidth: sizes.button.formPrimaryMinWidth,
        padding: "0 16px",
        borderRadius: radii.sm,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        color: palette.textSoft,
        ...typography.control,
        cursor: "default",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s8,
        ...style,
      }}
    >
      <DemoIcon size={18} />
      <span>{label}</span>
    </button>
  );
}

export function DemoLockFabButton({
  size = 56,
  title = "デモ版では追加できません",
}: {
  size?: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={title}
      aria-label={title}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        cursor: "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
      }}
    >
      <DemoIcon size={Math.round(size * 0.42)} />
    </button>
  );
}

export function DemoLockCircleButton({
  size = 28,
  title = "デモ版では編集できません",
}: {
  size?: number;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <DemoIcon size={Math.round(size * 0.6)} />
    </span>
  );
}

export function DemoLockNotice({
  title,
  description,
  compact = false,
}: {
  title: ReactNode;
  description: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        padding: compact ? 14 : 18,
        background: palette.formGroupBg,
        borderRadius: 18,
        border: `1px solid ${palette.borderSubtle}`,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div
        style={{
          width: compact ? 34 : 40,
          height: compact ? 34 : 40,
          borderRadius: 12,
          border: `1px solid ${palette.borderSubtle}`,
          background: palette.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <DemoIcon size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: palette.text }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: fontSize.base,
            lineHeight: 1.5,
            color: palette.textSoft,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}
