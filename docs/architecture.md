# Architecture

オープン会計 のパッケージ構成と依存方向の解説。

## 全体構造

workspace を「client」「server」「adapters」「composition roots」に分類する。
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
├── server-ports         DB port・保存型・wire DTO・ポート呼出しの直列化
├── server-usecases      CRUD オーケストレーション
├── server-api           OpenkkServerPort を組み立てる factory
├── server               上 4 つの meta barrel
│
├── file-db-adapter      OpenkkDbPort 実装 — SQLite Wasm + OPFS（ブラウザ永続化）
├── memory-db-adapter    OpenkkDbPort 実装 — インメモリ揮発 DB
├── sqlite-adapter       上記2つが共有するSQL・保存処理・マイグレーション
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

設定は `OpenkkConfig` に定義し、`useOpenkkConfig` で取得する。日付の状態は `useOpenkkToday` で購読する。

## 認証について

ユーザーは `OpenkkUser = EmbeddedUser | CustomUser`（`client-domain` の `user.ts`）でドメインモデル化する。`config.authMode` で挙動を選ぶ：

- `embedded`（sim/demo/original の既定）: 固定の `EmbeddedUser` 1名で起動時に自動サインイン。サインアウトは非活性（`userCanSignOut` が `false`）。`server-usecases` の auth は embedded 単一ユーザー向け local 実装。
- `custom`: Google 認証等で実ユーザー（`CustomUser`）を扱う派生プロダクト向け。独自バックエンドは `OpenkkServerPort.auth` を実装し、`RedeemCompletionCodeResponse` の未設定値を `null` で返す。

実装手順は [`authentication.md`](./authentication.md) を参照。

### 所有者チェックの責務

所有者検証は `server-usecases` の不変条件とする。会計期間に紐づくリソース（entries / fixedAssets / closings 等）は、対象 fiscal period または対象エンティティの `userId` を確認してから DB 操作へ進む。所有者の異なるリソースも不存在と同じエラーにし、識別子の有無を他ユーザーへ漏らさない。

`server-api` でも、URL 上の fiscal period と子リソースの所属関係、会計期間のフェーズ、入力形式を検証する。これは HTTP 境界の検証であり、`server-usecases` の所有者検証を省略する理由にはしない。これにより `server-usecases` を直接利用する独自 composition root でも同じ所有者境界が保たれる。

会計期間のパッチ可否・仕訳・固定資産・期首残高の入力規則そのものは `server-domain` が持ち、HTTP 境界（`server-api`）と DB 境界（`sqlite-adapter`）の両方がそこを呼ぶ。境界ごとに検証しつつ規則は一箇所に保つ。
境界の検証関数は入力を `unknown` で受け取り assertion signature で型を絞る。型が付いた引数は検証済みを意味する。

本締め時は `server-usecases` が保存済みデータを取得し、`server-domain` で生成仕訳を再計算・照合する。本締め後の帳票・分析は保存済み仕訳を使う。

## DB スキーマとマイグレーション

`server-ports` にDB操作契約と境界型を置く。SQL・保存処理・DDLは `sqlite-adapter` が担当する。テーブル構造は [`database-schema.md`](./database-schema.md) を参照。

`file-db-adapter`・`memory-db-adapter` は `sqlite-adapter` を利用し、起動時に `runMigrations()` を呼ぶ。`file-db-adapter` の OPFS SAHPool VFS は1ファイルを1接続でしか開けないため、Web Locks で1タブに限定し、同一プロセス内ではアダプタを1つだけ生成する。DB実装を差し替える場合は `OpenkkDbPort` を実装し、DDLはその実装内で管理する。

SQLite の単一接続では、トランザクションへ別操作が混入しないよう読取を含む公開ポート呼出しを直列化する。直列化は `server-ports` の `serializePortOperations` が担い、`OpenkkDbPort` と `OpenkkServerPort` の両方で使う。

エントリの取込み（`importMany`）は `localId` 単位で冪等で、同一 fiscal period に既存の `localId` はスキップされる。バルク挿入はトランザクションで囲まれ、途中失敗時はロールバックされる。

## PWA とオフラインキャッシュ

Download版のService Workerは静的エクスポートを事前保存する。正本は `scripts/service-worker.template.js` に置き、`gen-service-workers.mjs` が各アプリの `public/sw.js` を生成する。debugルートを事前保存するのはSim版だけ。

事前保存は2段階に分かれる。

- アプリシェル（テンプレートの `PRECACHE_URLS`）はビルド出力に必ず存在する。1つでも取得できなければインストールを完了させず、直前の完全なオフラインシェルを維持する。
- 本文の走査で発見した同一オリジンのアセットは推測なので、取得できなくてもインストールを続行する。Next.js が RSC ペイロードを HTML 内の JS 文字列として埋め込むため、走査結果には実在しないパス片が混ざる。

取得方針はドキュメントとmanifestがnetwork-first、静的アセットがcache-first。別オリジンとGET以外は対象外。実行時のキャッシュ保存失敗は取得済みの応答を妨げない。5xxとネットワーク障害だけ既存キャッシュへフォールバックし、4xxはそのまま返す。

各ビルドは `NEXT_PUBLIC_BUILD_ID` をService Worker URLの `v` クエリへ反映する。有効化時は同じアプリシェルprefixを持つ旧版だけを削除し、他用途のキャッシュは保持する。

`beforeinstallprompt` はインストール画面の描画前に発生し得るため、`client-ui` のPWA状態モジュールをshellから先行読込みし、単回利用のpromptをアプリ全体で保持する。

## テスト戦略

| レイヤー | ツール | 対象 |
|---|---|---|
| ユニット | vitest | ドメインロジック・パーサー・DB adapter |
| DB ポート契約適合 | vitest | `OpenkkDbPort` 共有 conformance（`server-ports/test-support/db-port-conformance.ts`）を memory/file-db 両実アダプタ＋遅延非同期コアに通し、dev(memory)↔prod(OPFS worker) の挙動一致を保証 |
| E2E | Playwright | Sim版の操作フローと、通常版の静的export・OPFS永続化。締めフローでは仮帳票＝確定帳票＝概要図を実画面で検証 |
| パッケージ構造 | vitest | workspace 整合性チェック |

`npm run test:e2e` は Sim版を専用 port 4306 で起動し、既存プロセスを再利用せず実行する。`npm run test:e2e:export` は通常版を静的exportして検査する。生成物・全workspace・3アプリ・両E2Eをまとめた検査は `npm run check:full` で実行できる。
このリポジトリに `OpenkkDbPort` 実装を追加したら `runDbPortConformance` に通すこと。conformance は `server-ports/test-support/` にあり npm には公開しないので、外部の実装はこのリポジトリを参照する。
