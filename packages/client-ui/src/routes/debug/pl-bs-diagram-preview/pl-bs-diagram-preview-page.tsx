"use client";

import { palette, typography } from "../../../shared/design-tokens";

export function PlBsDiagramPreviewPage() {
  if (false) {
    return (
      <section style={{ padding: 24, color: palette.textSoft }}>
        この画面は dev 環境専用です
      </section>
    );
  }
  return (
    <section style={{ padding: 24 }}>
      <div
        style={{
          maxWidth: 880,
          margin: "0 auto",
          border: `1px solid ${palette.borderSubtle}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h1 style={{ margin: 0, fontSize: typography.pageTitle.fontSize }}>
          PL / BS 図プレビュー
        </h1>
        <p style={{ marginTop: 10, color: palette.textSoft }}>
          PL / BS 図の表示確認用ページです。
        </p>
      </div>
    </section>
  );
}
