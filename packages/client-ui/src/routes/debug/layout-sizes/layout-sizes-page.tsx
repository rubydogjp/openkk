"use client";

import Link from "next/link.js";
import type { CSSProperties, ReactNode } from "react";

import {
  fontFamily,
  fontSize,
  palette,
  radii,
  sizes,
  spacing,
  tokenDefaults,
  typography,
} from "../../../shared/design-tokens.js";
import { Card, Section } from "../debug-ui.js";

type SizeGroup = keyof typeof tokenDefaults.sizes;

const SIZE_GROUP_TITLES: Record<SizeGroup, string> = {
  button: "ボタン",
  field: "入力欄",
  chip: "チップ",
  account: "勘定科目",
  shell: "シェル",
  content: "本文の最大幅",
  drawer: "ドロワー",
};

export function LayoutSizesPage() {
  return (
    <main
      style={{
        background: palette.pageBg,
        color: palette.text,
        minHeight: "100vh",
        padding: spacing.s24,
      }}
    >
      <div style={{ maxWidth: sizes.content.debugMaxWidth, margin: "0 auto" }}>
        <Link
          href="/debug"
          style={{ ...typography.control, color: palette.action }}
        >
          ← debug
        </Link>
        <h1 style={{ ...typography.pageTitle, margin: `${spacing.s16} 0 0` }}>
          レイアウト寸法
        </h1>

        <Section title="Spacing" lead="余白と間隔。">
          <Card style={null}>
            {tokenEntries(tokenDefaults.spacing).map(([name, value], index) => (
              <TokenRow
                key={name}
                name={`spacing.${name}`}
                value={`${value}px`}
                divider={index > 0}
              >
                <div style={barStyle(value)} />
              </TokenRow>
            ))}
          </Card>
        </Section>

        <Section title="Radius" lead="角丸。">
          <Card style={null}>
            {tokenEntries(tokenDefaults.radii).map(([name, value], index) => (
              <TokenRow
                key={name}
                name={`radii.${name}`}
                value={`${value}px`}
                divider={index > 0}
              >
                <div
                  style={{
                    width: 72,
                    height: 40,
                    borderRadius: value,
                    border: `1px solid ${palette.borderStrong}`,
                    background: palette.surfaceTint,
                  }}
                />
              </TokenRow>
            ))}
          </Card>
        </Section>

        <Section title="Sizes" lead="部品と領域の寸法。">
          <div style={{ display: "grid", gap: spacing.s12 }}>
            {tokenEntries(tokenDefaults.sizes).map(([group, defaults]) => (
              <Card key={group} style={null}>
                <div style={{ ...typography.sectionTitle }}>
                  {SIZE_GROUP_TITLES[group]}
                </div>
                {tokenEntries(defaults).map(([name, value]) => (
                  <TokenRow
                    key={name}
                    name={`sizes.${group}.${name}`}
                    value={`${value}px`}
                    divider
                  >
                    <div style={barStyle(value)} />
                  </TokenRow>
                ))}
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}

function tokenEntries<Values extends object>(
  values: Values,
): Array<[keyof Values & string, Values[keyof Values]]> {
  return Object.entries(values) as Array<
    [keyof Values & string, Values[keyof Values]]
  >;
}

function TokenRow(props: {
  name: string;
  value: string;
  divider: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 72px minmax(0, 1fr)",
        alignItems: "center",
        gap: spacing.s12,
        padding: `${spacing.s8} 0`,
        borderTop: props.divider ? `1px solid ${palette.borderSubtle}` : "none",
      }}
    >
      <code
        style={{
          fontFamily: fontFamily.mono,
          fontSize: fontSize.sm,
          color: palette.textSoft,
        }}
      >
        {props.name}
      </code>
      <span style={{ ...typography.amount, color: palette.text }}>
        {props.value}
      </span>
      <div style={{ minWidth: 0, overflow: "hidden" }}>{props.children}</div>
    </div>
  );
}

function barStyle(width: number): CSSProperties {
  return {
    width,
    maxWidth: "100%",
    height: 12,
    borderRadius: radii.xs,
    background: palette.actionBorder,
  };
}
