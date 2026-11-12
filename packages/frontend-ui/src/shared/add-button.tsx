"use client";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
} from "./design-tokens.js";
import { PlusIcon } from "./icons.js";

export function AddButton({ onClick }: { onClick: (() => void) | null }) {
  const disabled = onClick == null;
  return (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={disabled}
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: "none",
        background: palette.brand,
        color: palette.surface,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
        boxShadow: shadows.primaryButton,
      }}
    >
      <PlusIcon size={12} color="currentColor" />
      追加
    </button>
  );
}
