# オープン会計

個人事業主向け複式簿記 TypeScript ライブラリ / Open bookkeeping library for sole proprietors

- **公式サイト・ドキュメント**: https://rubydog.jp/openkk
- **開発者向け（アーキテクチャ・カスタマイズ）**: https://rubydog.jp/openkk/developer

---

## コントリビューター向けクイックスタート

```bash
npm install
npm run check     # package build + tsc --noEmit + Vitest
npm run check:full # 生成物検査 + 上記 + 3アプリbuild + Playwright
```

用途別のリファレンスアプリを起動:

```bash
npm run dev:vscode:openkk # 通常版（SQLite OPFS）— port 4322
npm run dev:vscode:sim    # Sim版（memory DB）— port 4303
npm run dev:vscode:demo   # デモ版（サンプルデータ・編集ロック）— port 4304
```

E2E テスト:

```bash
npm run test:e2e        # Sim版の操作シナリオ
npm run test:e2e:export # 通常版の静的export smoke
```

詳細は [`docs/`](./docs/) を参照してください。

API 契約: [`docs/api-contract.md`](./docs/api-contract.md)

## ライセンス

[MIT License](./LICENSE) — Copyright 2026 Rubydog
