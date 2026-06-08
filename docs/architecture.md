# Architecture

オープン会計 のパッケージ構成と依存方向の解説。

## 全体構造

16 パッケージを「client」「server」「adapters」「composition roots」の 4 グループに分類する。
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
└── openkk               Next.js リファレンスアプリ（dev / demo / prod）
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

`embedded-backend` と `openkk` はあくまで参照実装。独自アプリは自前の composition root でアダプタを組み合わせる。

## 認証について

ユーザーは `OpenkkUser = EmbeddedUser | CustomUser`（`client-domain` の `user.ts`）でドメインモデル化する。`config.authMode` で挙動を選ぶ：

- `embedded`（dev/demo/prod の既定）: 固定の `EmbeddedUser` 1名で起動時に自動サインイン。サインアウトは非活性（`userCanSignOut` が `false`）。`server-usecases` の auth は embedded 単一ユーザー向け local 実装。
- `custom`: Google 認証等で実ユーザー（`CustomUser`）を扱う OSS 派生プロダクト向け。サードパーティが `OpenkkServerPort.auth`（`startSession`/`completeSession`/`redeemCompletionCode`/`signOut`）を自前バックエンドで実装し、`redeemCompletionCode` で `CreateTokenResponse`（`userId` ＋任意で `displayName`/`email`/`iconUrl`/`authProvider`）を返す。クライアントはそれを `CustomUser` に写像する。

実装手順は [`authentication.md`](./authentication.md) を参照。

### 所有者チェックの責務

リソースの所有者検証は `server-api` の `getOwnedFiscalPeriod` に集約する。会計期間に紐づくリソース（entries / fixedAssets / closings 等）はすべて先に対象 fiscal period の所有を検証してから操作するため、エンティティ単位の操作も期間経由で保護される。一方 `server-usecases` の各メソッドは `userId` を受け取るが所有チェックは行わない（薄い委譲）。`server-usecases` を直接呼び出す独自 composition root を組む場合は、呼び出し側で同等の所有者検証を実装すること。

## DB スキーマとマイグレーション

DB操作契約は `db-adapter.ts`、DB境界型は `persistence-types.ts`、SQLite固有のDDL・migration・adapterは `sqlite/` に分離する。テーブル構造は [`database-schema.md`](./database-schema.md) を参照。

`file-db-adapter`・`memory-db-adapter` は共通SQLiteアダプタをラップし、起動時に `runMigrations()` を呼ぶ。DB実装を差し替える場合は `OpenkkDbPort` を実装し、保存モデルとDDLはその実装内で管理する。

エントリの取込み（`importMany`）は `localId` 単位で冪等で、同一 fiscal period に既存の `localId` はスキップされる。バルク挿入はトランザクションで囲まれ、途中失敗時はロールバックされる。

## テスト戦略

| レイヤー | ツール | 対象 |
|---|---|---|
| ユニット | vitest | ドメインロジック・パーサー・DB adapter |
| DB ポート契約適合 | vitest | `OpenkkDbPort` 共有 conformance（`server-ports/src/db-port-conformance.ts`）を memory/file-db 両実アダプタ＋遅延非同期コアに通し、dev(memory)↔prod(OPFS worker) の挙動一致を保証 |
| E2E | Playwright | ブラウザ操作フルフロー（dev モード）。締めフローでは仮帳票＝確定帳票＝概要図を実画面で検証 |
| パッケージ構造 | vitest | workspace 整合性チェック |

E2E はリファレンスアプリ（port 4306）を `dev:e2e` で起動した状態で実行する。
新しい `OpenkkDbPort` 実装を追加したら `runDbPortConformance` に通すこと。
