"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  palette,
  radii,
  shadows,
  spacing,
  typography,
} from "../../shared/design-tokens.js";

export function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: spacing.s32 }}>
      <h2 style={{ ...typography.contentTitle, margin: 0 }}>{title}</h2>
      <p
        style={{
          ...typography.body,
          color: palette.textSoft,
          margin: "6px 0 14px",
        }}
      >
        {lead}
      </p>
      {children}
    </section>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style: CSSProperties | null;
}) {
  return (
    <div
      style={{
        background: palette.surface,
        border: `1px solid ${palette.borderSubtle}`,
        borderRadius: radii.lg,
        boxShadow: shadows.card,
        padding: spacing.s16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
