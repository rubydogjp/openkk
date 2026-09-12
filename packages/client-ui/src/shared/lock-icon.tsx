"use client";

import type { CSSProperties } from "react";

import { palette, radii, sizes, spacing, typography } from "./design-tokens.js";

export function LockIcon({
  size,
  opacity,
}: {
  size: number | null;
  opacity: number | null;
}) {
  const iconSize = size ?? 20;
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 248 248"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: opacity ?? 1, display: "block" }}
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

export function LockButton({
  label,
  style,
}: {
  label: string | null;
  style: CSSProperties | null;
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
      <LockIcon size={18} opacity={null} />
      <span>{label ?? "この操作はできません"}</span>
    </button>
  );
}
