"use client";

import Link from "next/link";

import { palette, typography } from "../shared/design-tokens";

export function AssistBreadcrumb({ current }: { current: string }) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        ...typography.contentTitle,
      }}
    >
      <Link
        href="/assist"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: palette.brand,
          textDecoration: "none",
        }}
      >
        <LightningIcon size={18} color={palette.brand} />
        <span>補助</span>
      </Link>
      <span style={{ color: palette.textMuted }}>/</span>
      <span style={{ color: palette.text }}>{current}</span>
    </nav>
  );
}

function LightningIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M13 2L4.09 12.97a1 1 0 0 0 .76 1.62H11l-1 7.41 8.91-10.97a1 1 0 0 0-.76-1.62H13l1-7.41z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
