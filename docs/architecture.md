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
├── client-ports         外部境界 interface（OpenkkBackendPort, PrintPort, PlatformPort）
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
├── document-db-adapter  OpenkkDbPort 実装 — .openkk ファイルのバイト列を開き、変更を知らせる（ファイル版）
├── node-sqlite-db-adapter OpenkkDbPort 実装 — node:sqlite の SQLite ファイル（CLI 用・ベータ）
├── sqlite-adapter       上記2つが共有するSQL・保存処理・マイグレーション
├── embedded-backend-adapter  OpenkkBackendPort 実装 — 同プロセス HTTP 風 bridge
├── print-adapter        PrintPort 実装 — ブラウザ印刷
├── platform-browser-adapter PlatformPort 実装 — PWA・localStorage・ダウンロード等のブラウザ機能
│
├── embedded-backend     in-process backend composition root
├── cli                  CLI 版 composition root（ベータ。SQLite ファイルを操作する）
├── frontend             Web アプリ共通の provider・composition 配線
├── openkk               無印版 Next.js アプリ（SQLite OPFS）
├── openkk_sim           Sim版 Next.js アプリ（memory DB・固定時計・debug）
├── openkk_demo          デモ版 Next.js アプリ（seed済みmemory DB・再読み込みで初期化）
└── openkk_file          ファイル版 Next.js アプリ（.openkk ファイルを開いて自動保存）
```

## 設計原則

### 1. Client / Server 完全分離

`client-*` は `server-*` を import しない（逆も同様）。FiscalPeriod など共通する概念は両 side で独立定義する。

### 2. Ports & Adapters

外部依存はすべて interface (port) で抽象化する。

| Port                 | 定義場所       | 標準実装                                                                                            |
| -------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `OpenkkDbPort`       | `server-ports` | `file-db-adapter` / `memory-db-adapter` / `node-sqlite-db-adapter` / `document-db-adapter`          |
| `OpenkkBackendPort`  | `client-ports` | `embedded-backend-adapter`                                                                          |
| `PrintPort`          | `client-ports` | `print-adapter`                                                                                     |
| `PlatformPort`       | `client-ports` | `platform-browser-adapter`                                                                          |
| `OpenkkDocumentPort` | `client-ports` | `createOpenkkDocumentSession` (`client-usecases`) + `browserDocuments` (`platform-browser-adapter`) |

HTTP バックエンドは `embedded-backend-adapter` と同じ位置で差し替える。

実行環境（プラットフォーム）に依存する機能は `PlatformPort` に集める。対象はアプリのインストール、オフラインキャッシュの登録、key-value 保存、ファイル保存、外部URL・認証リダイレクトの遷移。UI とユースケースは `usePlatformAdapter` 経由で呼び、`window` や `navigator` を直接触らない。ネイティブアプリなど別のプラットフォームで動かす場合は `platform-browser-adapter` と同じ位置に実装を追加し、`PlatformAdapterProvider` に渡す。ポップオーバーの外側クリック検知など、Web ビューである限り共通の DOM 操作は UI に残す。

### 3. 4 層依存方向

```
client side:   ui → usecases → ports → domain
server side:   api → usecases → ports → domain
```

上流（ui/api）から下流（domain）への単方向のみ。domain は何も import しない。

### 4. Composition Roots は薄く

`embedded-backend`、`frontend`、4つのアプリ workspace、`cli` は参照実装。`cli` は React を読み込まないよう、`client` の meta barrel ではなく `client-domain`・`client-ports` を直接使う。独自アプリは自前の composition root でアダプタを組み合わせる。

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

`file-db-adapter`・`memory-db-adapter` は `sqlite-adapter` を利用し、起動時に `runMigrations()` を呼ぶ。`file-db-adapter` の OPFS SAHPool VFS は1ファイルを1接続でしか開けないため、Web Locks で1タブに限定し、同一プロセス内ではアダプタを1つだけ生成する。ロックは時間で打ち切らず、取れなければ `onWaitingForAnotherTab` で画面に知らせたうえで解放を待つ。別のタブを閉じる、または再読み込みで前の文書が片付くと、そのまま起動が続く。DB を開けたら、ストレージが足りないときなどにブラウザがデータを消さないよう `navigator.storage.persist()` で求める（すでに許可されていれば求めない。Firefox では確認が出るため、結果は待たずに起動を続ける）。起動の段階は `<html data-openkk-boot>`（`starting` / `waiting-for-another-tab` / `ready` / `failed`）に出し、E2E は待ち時間ではなくこの属性の変化を待つ。DB実装を差し替える場合は `OpenkkDbPort` を実装し、DDLはその実装内で管理する。

SQLite の単一接続では、トランザクションへ別操作が混入しないよう読取を含む公開ポート呼出しを直列化する。直列化は `server-ports` の `serializePortOperations` が担い、`OpenkkDbPort` と `OpenkkServerPort` の両方で使う。

エントリの取込み（`importMany`）は `localId` 単位で冪等で、同一 fiscal period に既存の `localId` はスキップされる。バルク挿入はトランザクションで囲まれ、途中失敗時はロールバックされる。

仕訳の表 (CSV) の取り込みは置き換えで、仕訳番号で突き合わせた削除・更新・追加を順に呼ぶ (`journalTableOperations`)。全体を 1 つのトランザクションにはしないが、同じ CSV をもう一度取り込めば残りだけが反映される。

## ファイル版（1つのファイルを開いて使う）

ファイル版は、エクセルのように帳簿を1つのファイル (`.openkk`) として開く。中身は CLI と同じ SQLite で、同じファイルを両方で扱える。部品は次の順につながる。

- `document-db-adapter`: ファイルのバイト列を SQLite Wasm のメモリ上に開き (`sqlite3_deserialize`)、`OpenkkDbPort` を返す。書き込みのあった操作のあとに `onChange` で知らせ、`exportBytes()` で全体をバイト列に戻す。オープン会計の帳簿でない SQLite と、新しすぎるスキーマは開かない。
- `createOpenkkDocumentSession` (`client-usecases`): `onChange` を受けて書き出しを重ねず最新だけ保存し、保存の状態 (`saved` / `saving` / `unsaved` / `conflict` / `failed`) を `OpenkkDocumentPort` として出す。書き先は `OpenkkDocumentSink` で、プラットフォームごとに差し替える。
- `browserDocuments` (`platform-browser-adapter`): File System Access API でファイルを開く・作る・最近使ったファイルを覚え、書く前に更新時刻を確かめる。使えないブラウザではダウンロードで保存する。
- `openkk_file`: 開いたファイルごとに上の3つと `embedded-backend` を組み、`OpenkkBundleRuntime.document` に渡す。画面は `useOpenkkDocument()` で、ファイル名・保存状態・別のファイルを開く操作を出す。ほかの版は `document: null`。
- 次の期間は新しい帳簿に作る (1 期間 = 1 ファイル)。「次期を作成」は `useNextFiscalPeriodBook` (`client-usecases`) で今の期間を圧縮保存と同じ形にし、`OpenkkDocumentPort.openNextBook` に渡す。`openkk_file` は新しい帳簿に期間を作って引き継ぎ (`applyCarryoverFromArchive`)、同じ置き場に `<期間名>.openkk` として保存して開き直す。帳簿を開くと、いちばん新しい期間を選んだ状態で始まる。

同じ部品で、デスクトップアプリなど別のプラットフォームのファイル版も、`OpenkkDocumentSink` を実装するだけで作れる。

### アプリの中の帳簿 (OPFS)

ファイルを書けないブラウザ (スマホ・Safari・Firefox) では、帳簿のファイルをアプリの中 (OPFS の `openkk-books/`) に置く (`inAppBooks`、`platform-browser-adapter`)。中身はファイル版と同じ `.openkk` で、`BrowserOpenedDocument` (バイト列と `OpenkkDocumentSink`) を返すので、上の部品をそのまま使える。

- 書き込みは worker の sync access handle で行う (Safari でも書けるように)。手順は `in-app-book-protocol.ts` にあり、控え (`.next`) を書き切ってから「準備済み」の印 (`.ready`) を置き、本体を書いてから両方を消す。開くときに印が残っていれば、本体を控えで戻す。印がなく控えだけ残っていれば、本体はそのままで控えを消す。
- OPFS の更新時刻はすぐ続けて書くと変わらないので、書く前の確かめは更新時刻ではなく中身で行う。最後に読んだ・書いた中身と今のファイルが違えば `conflict` を返す (別のタブが先に保存した場合)。
- 開く・作るときに `navigator.storage.persist()` を求める。
- アプリの中の帳簿には、バックアップの書き先 (`OpenkkDocumentBackupSink`、`bookBackups`) を付ける。スマホは共有シート、それ以外はダウンロードで、帳簿と同じ名前の `.openkk` を渡す。保存した日は localStorage (`openkk.book-backup:<名前>`) に覚える。帳簿を変えていて、前の保存 (まだなら最初に開いた日) から 30 日たっていれば、上の帯で知らせる (`OpenkkDocumentPort.backup`)。

### フォルダの帳簿 (パソコンの Chrome・Edge)

ファイルを書けるブラウザでは、最初に 1 回だけフォルダを選び (`showDirectoryPicker`)、そのハンドルを IndexedDB (`openkk-book-folder`) に覚える (`folderBooks`、`platform-browser-adapter`)。期間ごとの `.openkk` はアプリがそのフォルダに作る。

- `folderBooks` と `inAppBooks` は同じ形の置き場 (`BookPlace`: `list` / `open` / `create` / `remove`) で、アプリはファイルを書けるか (`canUseFolderBooks()`) でどちらかを選ぶ。
- 新しい帳簿のファイルは最初の保存のときに作る (保存せずにやめても空のファイルを残さない)。その名前のファイルが先にできていれば `conflict` を返す。
- 開いた帳簿の書き込みは、ファイル版と同じく更新時刻で確かめる (実際のファイルでは更新時刻が当てになる)。
- ブラウザが許可を忘れたとき (`permission()` が `prompt`) は、利用者の操作から `requestAccess()` を呼んで許可をもらい直す。

## PWA とオフラインキャッシュ

各アプリのService Workerは静的エクスポートを事前保存する。正本は `scripts/service-worker.template.js` に置き、`gen-service-workers.mjs` が各アプリの `public/sw.js` を生成する。debugルートを事前保存するのはSim版だけ。

事前保存は2段階に分かれる。

- アプリシェル（テンプレートの `PRECACHE_URLS`）はビルド出力に必ず存在する。1つでも取得できなければインストールを完了させず、直前の完全なオフラインシェルを維持する。
- 本文の走査で発見した同一オリジンのアセットは推測なので、取得できなくてもインストールを続行する。Next.js が RSC ペイロードを HTML 内の JS 文字列として埋め込むため、走査結果には実在しないパス片が混ざる。

取得方針はドキュメントとmanifestがnetwork-first、静的アセットがcache-first。Worker スクリプトはキャッシュ済みの応答を URL なしで作り直して返す。Next.js の worker 起動スクリプトは自身の URL の `#params` から読み込む chunk を決めるが、キャッシュした応答は保存時の要求 URL を持つため、そのまま返すと別の worker の chunk を読んで起動が止まる。別オリジンとGET以外は対象外。実行時のキャッシュ保存失敗は取得済みの応答を妨げない。5xxとネットワーク障害だけ既存キャッシュへフォールバックし、4xxはそのまま返す。

各ビルドは `NEXT_PUBLIC_BUILD_ID` をService Worker URLの `v` クエリへ反映する。有効化時は同じアプリシェルprefixを持つ旧版だけを削除し、他用途のキャッシュは保持する。

`beforeinstallprompt` はインストール画面の描画前に発生し得るため、`platform-browser-adapter` が読み込み時にイベントを購読し、単回利用のpromptをアプリ全体で保持する。composition root はアダプタをモジュールの先頭で import する。データをブラウザに置く無印版はインストール画面に `BrowserStorageInstallPage` を使い、追加済みでないときだけ、ブラウザのまま使うとデータが消えることがある旨（Safari では 7 日ほど開かないと消える）を操作の下に小さく出す。データを残さないデモ版・Sim版と、クラウドに置く版は `InstallPage`（注意書きなし）を使う。

## テスト戦略

| レイヤー          | ツール     | 対象                                                                                                                                                                                      |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ユニット          | vitest     | ドメインロジック・パーサー・DB adapter                                                                                                                                                    |
| DB ポート契約適合 | vitest     | `OpenkkDbPort` 共有 conformance（`server-ports/test-support/db-port-conformance.ts`）を memory/file-db 両実アダプタ＋遅延非同期コアに通し、dev(memory)↔prod(OPFS worker) の挙動一致を保証 |
| E2E               | Playwright | Sim版の操作フローと、無印版・デモ版の静的export・OPFS永続化。締めフローでは仮帳票＝確定帳票＝概要図を実画面で検証                                                                         |
| パッケージ構造    | vitest     | workspace 整合性チェック                                                                                                                                                                  |

`npm run test:e2e` は Sim版を専用 port 4306 で起動し、既存プロセスを再利用せず実行する。`npm run test:e2e:export` は無印版を静的exportして検査する。ファイル版の E2E (`tests-file`) は、フォルダの帳簿を試すためにインストール済みの Chrome で動かす (Playwright 同梱の Chromium は、IndexedDB に置いた OPFS のフォルダを読み戻すと落ちる)。生成物・全workspace・全アプリ・E2Eをまとめた検査は `npm run check:full` で実行できる。
このリポジトリに `OpenkkDbPort` 実装を追加したら `runDbPortConformance` に通すこと。conformance は `server-ports/test-support/` にあり npm には公開しないので、外部の実装はこのリポジトリを参照する。
