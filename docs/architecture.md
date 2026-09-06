# Architecture

オープン会計 のパッケージ構成と依存方向の解説。

## 全体構造

19 workspace を「client」「server」「adapters」「composition roots」に分類する。
依存グラフ: [`dependency-graph.md`](./dependency-graph.md)
API 契約: [`api-contract.md`](./api-contract.md)
SQLite スキーマ: [`database-schema.md`](./database-schema.md)

```
packages/
├── client-domain        純粋ドメイン型・計算ロジック（フレームワーク依存なし）
├── client-ports         外部境界 interface（OpenkkBackendPort, PrintPort）
├── client-usecases      React Context + hook のユースケース層
├── client-ui            React コンポーネント・デザイントークン
├── client               上 4 つの meta barrel
│
├── server-domain        サーバー側ドメインロジック・デフォルトマスターデータ
├── server-ports         DB port・保存型・wire DTO
├── server-usecases      CRUD オーケストレーション
├── server-api           OpenkkServerPort を組み立てる factory
├── server               上 4 つの meta barrel
│
├── file-db-adapter      OpenkkDbPort 実装 — SQLite Wasm + OPFS（ブラウザ永続化）
├── memory-db-adapter    OpenkkDbPort 実装 — インメモリ揮発 DB
├── embedded-backend-adapter  OpenkkBackendPort 実装 — 同プロセス HTTP 風 bridge
├── print-adapter        PrintPort 実装 — ブラウザ印刷
│
├── embedded-backend     in-process backend composition root
├── frontend             3アプリ共通の provider・composition 配線
├── openkk               通常版 Next.js アプリ（SQLite OPFS）
├── openkk_sim           Sim版 Next.js アプリ（memory DB・固定時計・debug）
└── openkk_demo          デモ版 Next.js アプリ（seed済みmemory DB・編集ロック）
```

## 設計原則

### 1. Client / Server 完全分離

`client-*` は `server-*` を import しない（逆も同様）。FiscalPeriod など共通する概念は両 side で独立定義する。

### 2. Ports & Adapters

外部依存はすべて interface (port) で抽象化する。

| Port | 定義場所 | 標準実装 |
|---|---|---|
| `OpenkkDbPort` | `server-ports` | `file-db-adapter` / `memory-db-adapter` |
| `OpenkkBackendPort` | `client-ports` | `embedded-backend-adapter` |
| `PrintPort` | `client-ports` | `print-adapter` |

HTTP バックエンドは `embedded-backend-adapter` と同じ位置で差し替える。

### 3. 4 層依存方向

```
client side:   ui → usecases → ports → domain
server side:   api → usecases → ports → domain
```

上流（ui/api）から下流（domain）への単方向のみ。domain は何も import しない。

### 4. Composition Roots は薄く

`embedded-backend`、`frontend`、3つのアプリ workspace は参照実装。独自アプリは自前の composition root でアダプタを組み合わせる。

## 認証について

ユーザーは `OpenkkUser = EmbeddedUser | CustomUser`（`client-domain` の `user.ts`）でドメインモデル化する。`config.authMode` で挙動を選ぶ：

- `embedded`（sim/demo/original の既定）: 固定の `EmbeddedUser` 1名で起動時に自動サインイン。サインアウトは非活性（`userCanSignOut` が `false`）。`server-usecases` の auth は embedded 単一ユーザー向け local 実装。
- `custom`: Google 認証等で実ユーザー（`CustomUser`）を扱う OSS 派生プロダクト向け。サードパーティが `OpenkkServerPort.auth`（`startSession`/`completeSession`/`redeemCompletionCode`/`signOut`）を自前バックエンドで実装し、`redeemCompletionCode` で `CreateTokenResponse`（`userId` ＋任意で `displayName`/`email`/`iconUrl`/`authProvider`）を返す。クライアントはそれを `CustomUser` に写像する。

実装手順は [`authentication.md`](./authentication.md) を参照。

### 所有者チェックの責務

所有者検証は `server-usecases` の不変条件とする。会計期間に紐づくリソース（entries / fixedAssets / closings 等）は、対象 fiscal period または対象エンティティの `userId` を確認してから DB 操作へ進む。所有者の異なるリソースも不存在と同じエラーにし、識別子の有無を他ユーザーへ漏らさない。

`server-api` でも、URL 上の fiscal period と子リソースの所属関係、会計期間のフェーズ、入力形式を検証する。これは HTTP 境界の検証であり、`server-usecases` の所有者検証を省略する理由にはしない。これにより `server-usecases` を直接利用する独自 composition root でも同じ所有者境界が保たれる。

本締め用の生成仕訳はクライアントから受け取った内容を信用せず、`server-domain` が永続化済みの仕訳・固定資産・期首データから再計算して一致を検証する。

## DB スキーマとマイグレーション

DB操作契約は `db-adapter.ts`、DB境界型は `persistence-types.ts` に置く。SQLite固有処理は `sqlite/` 配下で `fiscal-period-store.ts`、`entry-store.ts`、`fixed-asset-store.ts`、`closing-store.ts`、`opening-store.ts`、`seed-store.ts` に分け、`adapter.ts` は組み立てだけを担当する。テーブル構造は [`database-schema.md`](./database-schema.md) を参照。

`file-db-adapter`・`memory-db-adapter` は共通SQLiteアダプタをラップし、起動時に `runMigrations()` を呼ぶ。DB実装を差し替える場合は `OpenkkDbPort` を実装し、保存モデルとDDLはその実装内で管理する。

SQLite の単一接続では、トランザクションへ別操作が混入しないよう読取を含む公開ポート呼出しを直列化する。

エントリの取込み（`importMany`）は `localId` 単位で冪等で、同一 fiscal period に既存の `localId` はスキップされる。バルク挿入はトランザクションで囲まれ、途中失敗時はロールバックされる。

## PWA とオフラインキャッシュ

Download版のService Workerは、静的エクスポートの主要ルートと発見した同一オリジンの静的アセットをインストール時に事前保存する。正本は `scripts/service-worker.template.js` に置き、`gen-service-workers.mjs` が各アプリの `public/sw.js` を生成する。通常版・デモ版はdebugルートを事前保存せず、Sim版だけが保存する。ドキュメントとmanifestはnetwork-first、静的アセットはcache-first、別オリジンとGET以外のリクエストはキャッシュ対象外とする。

事前保存が一部でも失敗した新しいWorkerはインストールを完了させず、直前の完全なオフラインシェルを維持する。実行時のキャッシュ保存失敗は取得済みレスポンスを妨げず、5xxまたはネットワーク障害時だけ既存キャッシュへフォールバックする。4xxは現在の応答としてそのまま返す。

各ビルドは`NEXT_PUBLIC_BUILD_ID`をService Worker URLの`v`クエリへ反映する。新しいWorkerの有効化時には同じアプリシェル用prefixを持つ旧バージョンだけを削除し、他用途のキャッシュは保持する。

`beforeinstallprompt`はインストール画面の描画前に発生し得るため、`client-ui`のPWA状態モジュールをshellから先行読込みし、単回利用のpromptをアプリ全体で保持する。

## テスト戦略

| レイヤー | ツール | 対象 |
|---|---|---|
| ユニット | vitest | ドメインロジック・パーサー・DB adapter |
| DB ポート契約適合 | vitest | `OpenkkDbPort` 共有 conformance（`server-ports/src/db-port-conformance.ts`）を memory/file-db 両実アダプタ＋遅延非同期コアに通し、dev(memory)↔prod(OPFS worker) の挙動一致を保証 |
| E2E | Playwright | Sim版のブラウザ操作フルフローと、通常版の静的export smoke。締めフローでは仮帳票＝確定帳票＝概要図を実画面で検証 |
| パッケージ構造 | vitest | workspace 整合性チェック |

`npm run test:e2e` は Sim版を専用 port 4306 で起動し、既存プロセスを再利用せず実行する。`npm run test:e2e:export` は通常版を静的exportして検査する。生成物・全workspace・3アプリ・両E2Eをまとめた検査は `npm run check:full` で実行できる。
新しい `OpenkkDbPort` 実装を追加したら `runDbPortConformance` に通すこと。
