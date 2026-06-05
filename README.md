# オープン会計

個人事業主向け複式簿記 TypeScript ライブラリ / Open bookkeeping library for sole proprietors

- **公式サイト・ドキュメント**: https://rubydog.jp/openkk
- **開発者向け（アーキテクチャ・カスタマイズ）**: https://rubydog.jp/openkk/developer

---

## コントリビューター向けクイックスタート

```bash
npm install
npm test          # vitest
npm run lint      # tsc --noEmit (全パッケージ)
```

リファレンスアプリ（`packages/openkk`）を起動:

```bash
cd packages/openkk
npm run dev       # dev モード — port 4303
npm run dev:demo  # demo モード — port 4312
```

E2E テスト:

```bash
npx playwright test --config e2e/playwright.config.ts
```

詳細は [`docs/`](./docs/) を参照してください。

API 契約: [`docs/api-contract.md`](./docs/api-contract.md)

## ライセンス

[Apache License 2.0](./LICENSE) — Copyright 2026 Rubydog
