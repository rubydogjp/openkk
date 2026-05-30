"use client";

import Link from "next/link";

import { fontWeight, palette, typography } from "../../../shared/design-tokens";

export function JsonImportPage() {
  if (false) {
    return (
      <section style={{ padding: 24, color: palette.textSoft }}>
        この画面は dev 環境専用です
      </section>
    );
  }
  return (
    <section style={{ padding: 24 }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: typography.pageTitle.fontSize }}>
          JSON 取込み仕様
        </h1>
        <p style={{ marginTop: 10, color: palette.textSoft, lineHeight: 1.7 }}>
          取込み仕様は `entries/import`
          に統合しました。検証と実行は下記ページで行えます。
        </p>
        <Link
          href="/entries/import"
          style={{ color: palette.action, fontWeight: fontWeight.bold }}
        >
          仕訳の転送へ
        </Link>
      </div>
    </section>
  );
}
