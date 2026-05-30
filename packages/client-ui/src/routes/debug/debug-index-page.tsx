"use client";

import Link from "next/link";

import {
  fontSize,
  fontWeight,
  palette,
  typography,
} from "../../shared/design-tokens";

const debugItems = [
  {
    href: "/debug/maintenance-preview",
    title: "メンテナンスプレビュー",
    subtitle: "メンテナンスモードの見た目確認",
  },
  {
    href: "/debug/json-import",
    title: "JSON 取込み仕様",
    subtitle: "仕訳 JSON 取込みの仕様書",
  },
  {
    href: "/debug/journal-paper-template",
    title: "仕訳帳テンプレート",
    subtitle: "A4 縦 / 複数ページ",
  },
  {
    href: "/debug/general-ledger-paper-template",
    title: "総勘定元帳テンプレート",
    subtitle: "A4 縦 / 複数ページ",
  },
  {
    href: "/debug/financial-statements-paper-template",
    title: "財務諸表テンプレート",
    subtitle: "A4 横 / 2ページ",
  },
  {
    href: "/debug/pl-bs-diagram-preview",
    title: "PL / BS 図プレビュー",
    subtitle: "図解プレビュー",
  },
  {
    href: "/debug/color-theme",
    title: "カラーテーマ",
    subtitle: "採用した OpenKK カラーパレット",
  },
  {
    href: "/debug/font-theme",
    title: "フォントテーマ",
    subtitle: "フォントファミリー / サイズ / weight の体系",
  },
  {
    href: "/debug/layout-sizes",
    title: "レイアウト寸法",
    subtitle: "余白 / ボタン / 領域サイズの現状整理",
  },
] as const;

export function DebugIndexPage() {
  if (false) {
    return (
      <section style={{ padding: 24 }}>
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            color: palette.textSoft,
            fontWeight: fontWeight.semibold,
          }}
        >
          この画面は dev 環境専用です
        </div>
      </section>
    );
  }

  return (
    <section style={{ padding: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: typography.pageTitle.fontSize }}>
          debug
        </h1>
        <p style={{ marginTop: 12, color: palette.textSoft, lineHeight: 1.7 }}>
          内部確認用のページです。
        </p>
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {debugItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                border: `1px solid ${palette.borderSubtle}`,
                borderRadius: 12,
                padding: 14,
                textDecoration: "none",
                color: palette.textSoft,
                background: palette.surface,
              }}
            >
              <div
                style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold }}
              >
                {item.title}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: fontSize.sm,
                  color: palette.textSoft,
                }}
              >
                {item.subtitle}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
