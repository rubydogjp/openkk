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
      className="bk-narrow-icon-only"
      onClick={onClick ?? undefined}
      disabled={disabled}
      aria-label="追加"
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
        justifyContent: "center",
        gap: spacing.s6,
        boxShadow: shadows.primaryButton,
      }}
    >
      <PlusIcon size={12} color="currentColor" />
      <span className="bk-button-label">追加</span>
    </button>
  );
}
