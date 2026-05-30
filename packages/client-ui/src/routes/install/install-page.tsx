

import { palette, fontSize, fontWeight, spacing, fontFamily } from "../../shared/design-tokens";

export function InstallPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: `${spacing.s24}px ${spacing.s16}px`,
        color: palette.text,
        fontFamily: fontFamily.sans,
      }}
    >
      <h1 style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.s16 }}>
        ローカル版 インストール案内
      </h1>
      <p style={{ fontSize: fontSize.md, lineHeight: 1.7, marginBottom: spacing.s16 }}>
        ローカル版はブラウザ内で完結する PWA (Progressive Web App) です。
        データはすべてご利用の端末にのみ保存され、サーバーには送信されません。
      </p>

      <section style={{ marginTop: spacing.s24 }}>
        <h2 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.s12 }}>
          インストール手順 (Chrome / Edge)
        </h2>
        <ol style={{ fontSize: fontSize.md, lineHeight: 1.8, paddingLeft: spacing.s16 }}>
          <li>
            アドレスバー右側の「インストール」アイコン (またはメニューの「アプリをインストール」) をクリック
          </li>
          <li>表示されるダイアログで「インストール」を選択</li>
          <li>独立ウィンドウでアプリが起動</li>
        </ol>
      </section>

      <section style={{ marginTop: spacing.s24 }}>
        <h2 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.s12 }}>
          インストール手順 (Safari iOS / iPadOS)
        </h2>
        <ol style={{ fontSize: fontSize.md, lineHeight: 1.8, paddingLeft: spacing.s16 }}>
          <li>共有メニュー (□↑) をタップ</li>
          <li>「ホーム画面に追加」をタップ</li>
          <li>ホーム画面に追加されたアイコンから起動</li>
        </ol>
      </section>

      <section style={{ marginTop: spacing.s24 }}>
        <h2 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.s12 }}>
          注意事項
        </h2>
        <ul style={{ fontSize: fontSize.md, lineHeight: 1.8, paddingLeft: spacing.s16 }}>
          <li>同じオリジンを複数タブで同時に開くことはできません。</li>
          <li>ブラウザのサイトデータを削除すると保存内容も失われます。定期的に書き出し機能でバックアップしてください。</li>
          <li>デバイス間同期はありません。複数端末で使う場合はクラウド版をご検討ください。</li>
        </ul>
      </section>
    </main>
  );
}
