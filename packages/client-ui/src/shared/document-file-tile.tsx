"use client";

import type { CSSProperties } from "react";

import { palette, radii, sizes, spacing, typography } from "./design-tokens.js";

export type DocumentFileItem = {
  label: string;
  description: string;
  active: boolean;
  onClick: (() => void) | null;
};

export function DocumentFileList({
  items,
  actionLabel,
}: {
  items: DocumentFileItem[];
  actionLabel: string;
}) {
  return (
    <div style={listStyle}>
      {items.map((item, index) => (
        <DocumentFileTile
          key={item.label}
          {...item}
          actionLabel={actionLabel}
          showDivider={index > 0}
        />
      ))}
    </div>
  );
}

function DocumentFileTile(
  props: DocumentFileItem & {
    actionLabel: string;
    showDivider: boolean;
  },
) {
  const isActive = props.active;
  const isClickable = isActive && props.onClick != null;
  return (
    <div
      style={{
        ...rowStyle,
        borderTop: props.showDivider
          ? `1px solid ${palette.borderSubtle}`
          : "none",
        opacity: isActive ? 1 : 0.58,
      }}
    >
      <img
        src="/icons/document.svg"
        alt=""
        aria-hidden="true"
        width={22}
        height={22}
        style={{ display: "block", flexShrink: 0 }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            ...typography.control,
            display: "block",
            color: palette.text,
          }}
        >
          {props.label}
        </span>
        <span style={{ ...typography.helper, color: palette.textSoft }}>
          {props.description}
        </span>
      </span>
      <button
        type="button"
        onClick={props.onClick ?? undefined}
        disabled={!isClickable}
        style={{
          ...actionButtonStyle,
          cursor: isClickable ? "pointer" : "default",
        }}
      >
        {props.actionLabel}
      </button>
    </div>
  );
}

const listStyle: CSSProperties = {
  border: `1px solid ${palette.borderEmphasis}`,
  borderRadius: radii.lg,
  background: palette.surface,
  overflow: "hidden",
};

const rowStyle: CSSProperties = {
  minHeight: 66,
  padding: `0 ${spacing.s12}`,
  display: "flex",
  alignItems: "center",
  gap: spacing.s12,
};

const actionButtonStyle: CSSProperties = {
  height: sizes.button.compactHeight,
  minWidth: sizes.button.compactMinWidth,
  padding: "0 14px",
  borderRadius: radii.sm,
  border: `1px solid ${palette.actionBorder}`,
  background: palette.surface,
  color: palette.action,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  ...typography.control,
};
