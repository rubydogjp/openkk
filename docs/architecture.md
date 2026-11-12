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
├── file-db-adapter      OpenkkDbPort 実装 — SQLite Wasm + OPFS（ブラウザ永続化。無印版は前の版の帳簿を移すときに読む）
├── memory-db-adapter    OpenkkDbPort 実装 — インメモリ揮発 DB
├── document-db-adapter  OpenkkDbPort 実装 — 帳簿 1 冊 (.openkk のバイト列) をメモリ上に開き、変更を知らせる
├── books-db-adapter     OpenkkDbPort 実装 — 会計期間ごとの帳簿 (.openkk) に振り分け、変わった帳簿を置き場へ保存する（無印版）
├── node-sqlite-db-adapter OpenkkDbPort 実装 — node:sqlite の SQLite ファイル（openkk-cli 用・ベータ）
├── sqlite-adapter       上記が共有するSQL・保存処理・マイグレーション・最後に変えた時刻の記録
├── embedded-backend-adapter  OpenkkBackendPort 実装 — 同プロセス HTTP 風 bridge
├── book-files-adapter   OpenkkBookFilesPort 実装 — 帳簿をファイルへ保存する・ファイルから取り込む（無印版）
├── print-adapter        PrintPort 実装 — ブラウザ印刷
├── platform-browser-adapter PlatformPort 実装 — PWA・localStorage・ダウンロード等のブラウザ機能
│
├── embedded-backend     in-process backend composition root
├── cli                  openkk-cli の composition root（ベータ。コマンドは openkk。帳簿の .openkk を操作する）
├── frontend             Web アプリ共通の provider・composition 配線
├── openkk               無印版 Next.js アプリ（会計期間ごとの帳簿をブラウザの中に置き、「保存」でファイルに書き出す）
├── openkk_sim           Sim版 Next.js アプリ（memory DB・固定時計・debug）
└── openkk_demo          デモ版 Next.js アプリ（seed済みmemory DB・再読み込みで初期化）
```

## 設計原則

### 1. Client / Server 完全分離

`client-*` は `server-*` を import しない（逆も同様）。FiscalPeriod など共通する概念は両 side で独立定義する。

### 2. Ports & Adapters

外部依存はすべて interface (port) で抽象化する。

| Port                  | 定義場所       | 標準実装                                                                                                        |
| --------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `OpenkkDbPort`        | `server-ports` | `file-db-adapter` / `memory-db-adapter` / `node-sqlite-db-adapter` / `document-db-adapter` / `books-db-adapter` |
| `OpenkkBackendPort`   | `client-ports` | `embedded-backend-adapter`                                                                                      |
| `PrintPort`           | `client-ports` | `print-adapter`                                                                                                 |
| `PlatformPort`        | `client-ports` | `platform-browser-adapter`                                                                                      |
| `OpenkkBookFilesPort` | `client-ports` | `book-files-adapter`                                                                                            |

HTTP バックエンドは `embedded-backend-adapter` と同じ位置で差し替える。

### クラウドとローカルで層をそろえる

呼び名は、全体を openkk、コマンドラインの道具を openkk-cli (コマンドは `openkk`) とする。クラウドに置く版 (HTTP 越しの独自バックエンド) と、手元に置く版 (無印版・openkk-cli) は、同じ層の並びで作る。違うのは呼び出し方 (HTTP か同じプロセスか) と実装する言語だけで、それぞれの層の役割は変えない。

```
クラウド:  画面 → OpenkkBackendPort → HTTP        → サーバー (API・手続き) → 保存先 (サーバーの DB)
無印版:    画面 → OpenkkBackendPort → 同じプロセス → server-* (API・手続き) → OpenkkDbPort (books-db-adapter → ブラウザの中の帳簿)
openkk-cli: コマンド → OpenkkBackendPort → 同じプロセス → server-* (API・手続き) → OpenkkDbPort (node-sqlite-db-adapter → .openkk ファイル)
```

- 画面 (`client-*`) は保存先の形を知らない。無印版が会計期間ごとに帳簿のファイルを分けているのは保存先 (`OpenkkDbPort` の実装) の中の話で、期間の一覧・追加・次期の作成・引き継ぎは、どの版でも同じ `OpenkkBackendPort` の呼び出しになる。
- 版ごとに足す機能は port として足し、ない版では `null` を渡す。帳簿をファイルに保存する・取り込む (`OpenkkBookFilesPort`) は無印版だけが持つ。

実行環境（プラットフォーム）に依存する機能は `PlatformPort` に集める。対象はアプリのインストール、オフラインキャッシュの登録、key-value 保存、ファイル保存、外部URL・認証リダイレクトの遷移。UI とユースケースは `usePlatformAdapter` 経由で呼び、`window` や `navigator` を直接触らない。ネイティブアプリなど別のプラットフォームで動かす場合は `platform-browser-adapter` と同じ位置に実装を追加し、`PlatformAdapterProvider` に渡す。ポップオーバーの外側クリック検知など、Web ビューである限り共通の DOM 操作は UI に残す。

### 3. 4 層依存方向

```
client side:   ui → usecases → ports → domain
server side:   api → usecases → ports → domain
```

上流（ui/api）から下流（domain）への単方向のみ。domain は何も import しない。

### 4. Composition Roots は薄く

`embedded-backend`、`frontend`、3つのアプリ workspace、`cli` は参照実装。`cli` は React を読み込まないよう、`client` の meta barrel ではなく `client-domain`・`client-ports` を直接使う。独自アプリは自前の composition root でアダプタを組み合わせる。

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

`file-db-adapter`・`memory-db-adapter` は `sqlite-adapter` を利用し、起動時に `runMigrations()` を呼ぶ。`file-db-adapter` の OPFS SAHPool VFS は1ファイルを1接続でしか開けないため、Web Locks で1タブに限定し、同一プロセス内ではアダプタを1つだけ生成する。ロックは時間で打ち切らず、取れなければ `onWaitingForAnotherTab` で画面に知らせたうえで解放を待つ。別のタブを閉じる、または再読み込みで前の文書が片付くと、そのまま起動が続く。DB を開けたら、ストレージが足りないときなどにブラウザがデータを消さないよう `navigator.storage.persist()` で求める（すでに許可されていれば求めない。Firefox では確認が出るため、結果は待たずに起動を続ける）。起動の段階は `<html data-openkk-boot>`（`starting` / `waiting-for-another-tab` / `ready` / `failed`）に出し、無印版は帳簿の保存の状態を `<html data-openkk-storage>` に出す。E2E は待ち時間ではなくこれらの属性の変化を待つ (画面を移るときは、保存が終わってから移る)。DB実装を差し替える場合は `OpenkkDbPort` を実装し、DDLはその実装内で管理する。

SQLite の単一接続では、トランザクションへ別操作が混入しないよう読取を含む公開ポート呼出しを直列化する。直列化は `server-ports` の `serializePortOperations` が担い、`OpenkkDbPort` と `OpenkkServerPort` の両方で使う。

エントリの取込み（`importMany`）は `localId` 単位で冪等で、同一 fiscal period に既存の `localId` はスキップされる。バルク挿入はトランザクションで囲まれ、途中失敗時はロールバックされる。

仕訳の表 (CSV) の取り込みは置き換えで、仕訳番号で突き合わせた削除・更新・追加を順に呼ぶ (`journalTableOperations`)。全体を 1 つのトランザクションにはしないが、同じ CSV をもう一度取り込めば残りだけが反映される。

## 帳簿のファイル（無印版）

無印版は、データをブラウザの中 (OPFS の `openkk-books/`) に置く。置き方は環境で変えない。1 つの会計期間を 1 冊の帳簿 (`.openkk`、中身は SQLite) にし、利用者は左上の「保存」でその期間の帳簿をファイルに書き出す。同じファイルを openkk-cli でも扱える。部品は次の順につながる。

- `document-db-adapter`: 帳簿 1 冊のバイト列を SQLite Wasm のメモリ上に開き (`sqlite3_deserialize`)、`OpenkkDbPort` を返す。書き込みのあった操作のあとに `onChange` で知らせ、`exportBytes()` で全体をバイト列に戻す。オープン会計の帳簿でない SQLite と、新しすぎるスキーマは開かない。
- `books-db-adapter`: 置き場 (`BookStore`: `list` / `read` / `write` / `remove`) にある帳簿をすべて開き、1 つの `OpenkkDbPort` にまとめる。期間の ID で帳簿に振り分け、期間の作成・圧縮済みファイルの取り込みは新しい帳簿を作り、期間の削除は帳簿を消す。日付の重なりは帳簿をまたいで確かめる。次期の作成 (`createNext`) と引き継ぎの上書き (`applyCarryover`) は、引き継ぎ元の帳簿を読んで圧縮保存と同じ形にし、引き継ぎ先の帳簿の `applyCarryoverFromArchive` に渡す。`runDbPortConformance` に通してあり、1 つの DB に全期間を置く実装と同じ振る舞いになる。
- 変わった帳簿は、操作のあとに置き場へ丸ごと保存する (書き出しを重ねず、最新だけ)。新しい帳簿の作成・削除・置き換えは、置き場に書けてから操作を終える。保存の状態 (`saved` / `saving` / `failed`) は `<html data-openkk-storage>` に出し、保存できなかったときは上の帯で知らせる。保存が済む前にページを離れようとすると、ブラウザの確かめを出す。
- 帳簿を読むのも書くのも 1 つの順番待ち (`operation-queue.ts`) を通す。書き出し (`exportBytes`) を別の操作のトランザクションの途中に挟まないため。
- 読めない帳簿 (壊れている・新しい版で作られた) は飛ばして起動し、ファイルは消さずに残す。件数を上の帯で知らせる。
- `platform-browser-adapter` の `inAppBookStore`: OPFS に `BookStore` を実装する。書き込みは worker の sync access handle で行う (Safari でも書けるように)。手順は `in-app-book-protocol.ts` にあり、控え (`.next`) を書き切ってから「準備済み」の印 (`.ready`) を置き、本体を書いてから両方を消す。一覧を読むときに印や控えが残っていれば、印があれば本体を控えで戻し、控えだけなら控えを消す (初めての保存の途中で止まった帳簿も、ここで仕上げるか捨てる)。帳簿のファイル名は中身と関係のない一意な名前で、どの期間の帳簿かは中身から読む。
- 同じブラウザでは 1 つのタブでだけ動かす。起動するときに Web Lock (`openkk-books`) を取り、取れなければ別のタブが閉じるのを待つ (`waiting-for-another-tab`)。Web Locks のないブラウザでは起動しない。起動したら `navigator.storage.persist()` を求める。

### 最後に変えた時刻

帳簿は `openkk_meta` の `last_changed_at` (ミリ秒) に、最後に中身を変えた時刻を持つ。`sqlite-adapter` の `runInTransaction` が、行を変えたトランザクションの中で更新する (前の値より必ず大きくする)。同じ層を通る openkk-cli の変更でも更新される。読むだけの操作と、失敗して巻き戻った操作では変わらない。

### ファイルに保存する・取り込む

`book-files-adapter` が `OpenkkBookFilesPort` を実装し、画面は `useOpenkkBookFile` / `useOpenkkBookFiles` で使う。ほかの版は `bookFiles: null`。

- 保存: 今の期間の帳簿を `<期間名>.openkk` として渡す (スマホは共有シート、それ以外はダウンロード)。保存したときの `last_changed_at` と日時を localStorage (`openkk.book-save:<期間ID>`) に覚える。
- 左上の表示: 帳簿の `last_changed_at` が覚えた値と違えば「保存していない変更があります」、同じなら「前回 11/3」。変更があって、前の保存 (まだなら期間を作った日) から 30 日たっていれば、上の帯で知らせる。
- 取り込みは復元で、混ぜない。ファイルの中の期間ごとに、今ある期間との関係を見る (`books-db-adapter` の `inspectBookFile`)。
  - 同じ ID の期間がない・日付の重なる期間もない: 新しい期間として足す (確かめない)。
  - 同じ ID の期間がある: ファイルの `last_changed_at`・今の帳簿の値・保存したときに覚えた値を比べる (`bookImportCase`)。同じなら何もしない。ファイルが保存のあとに変わっていれば「アプリの外で変更がありました」、アプリの側に保存していない変更があればそれが失われることを知らせ、確かめてから帳簿を置き換える。
  - ID は違うが開始日・終了日が同じ期間がある: 別に作られた帳簿として、確かめてから置き換える。
  - それ以外の重なり: 取り込まない。
  - 確かめのダイアログから「先に今のデータを保存」できる。確かめている間に帳簿が変わっていたら取り込まず、やり直しを求める。
- 複数の期間が入ったファイル (openkk-cli で作ったもの) は、期間ごとの帳簿に分けて取り込む (`splitBookFile`)。分けたあと、期間・仕訳・固定資産が元と同じかを確かめ、違えば取り込まない。
- 取り込んだあとはページを読み込み直し、取り込んだ期間を選んだ状態で始める。
- 無印版は取り込みの入口を 1 つにしている。選んだファイルの先頭が zip なら、前の版の圧縮済みファイルとして `fiscalPeriods.importArchived` に渡す (`looksLikeZip`)。それ以外は帳簿のファイルとして扱う。
- 無印版には圧縮保存の操作を出さない。「次の期間へ」の手順には、「保存」と同じファイルを出す「バックアップをダウンロード」を置く。圧縮保存の契約 (`archive` / `purgeArchivedData`) と状態 (`archiveStatus`) は、クラウドに置く版と前の版のデータのために残している。
- 無印版はファイルを見張らない。ファイルを読むのは取り込むときだけ。

初めて開いたときに 1 回、データをブラウザの中に置くこと・しばらく開かないと消えることがあること・「保存」でファイルに書き出せることを説明する (`BookStorageNotice`、localStorage の `openkk.book-storage-notice.seen`)。

### 前の版の帳簿を移す

26.3 までの無印版は、すべての期間を OPFS の SAHPool (`.openkk/` の `/openkk.sqlite3`) の 1 つの DB に置いていた。新しい版は起動するとき、その DB を `exportFileDbBytes` (`file-db-adapter`) で書き出し、期間ごとの帳簿に分けて (`splitBookFile`) 置き場に書く (`packages/openkk/app/legacy-book.ts`)。期間の ID は変えない。

- 前の DB は消さない。すべての期間を書けたら OPFS の直下に印 (`openkk-legacy-book-moved`) を置き、二度は移さない。
- 途中で止まったら印を置かず、次の起動で続きから移す。すでに置き場にある期間 (ID で見分ける) は書かない。
- 分けたあとに元と中身が合わなければ、何も書かずに起動を止める (前の DB はそのまま残る)。
- 前の版のタブが開いていると DB のロック (`openkk-db:openkk.sqlite3`) が取れないので、そのタブを閉じるまで待つ。
- 書き出しは DB を開いてから `sqlite3_js_db_export` で行う (途中で止まった書き込みの journal があっても、開いたときに戻してから書き出す)。OPFS に `.openkk/` がなければ SQLite を読み込まない。SAHPool は開いた名前に `/` を付けて覚えるので、両方の名前で探す。

## PWA とオフラインキャッシュ

各アプリのService Workerは静的エクスポートを事前保存する。正本は `scripts/service-worker.template.js` に置き、`gen-service-workers.mjs` が各アプリの `public/sw.js` を生成する。debugルートを事前保存するのはSim版だけ。

事前保存は2段階に分かれる。

- アプリシェル（テンプレートの `PRECACHE_URLS`）はビルド出力に必ず存在する。1つでも取得できなければインストールを完了させず、直前の完全なオフラインシェルを維持する。
- 本文の走査で発見した同一オリジンのアセットは推測なので、取得できなくてもインストールを続行する。Next.js が RSC ペイロードを HTML 内の JS 文字列として埋め込むため、走査結果には実在しないパス片が混ざる。

取得方針はドキュメントとmanifestがnetwork-first、静的アセットがcache-first。Worker スクリプトはキャッシュ済みの応答を URL なしで作り直して返す。Next.js の worker 起動スクリプトは自身の URL の `#params` から読み込む chunk を決めるが、キャッシュした応答は保存時の要求 URL を持つため、そのまま返すと別の worker の chunk を読んで起動が止まる。別オリジンとGET以外は対象外。実行時のキャッシュ保存失敗は取得済みの応答を妨げない。5xxとネットワーク障害だけ既存キャッシュへフォールバックし、4xxはそのまま返す。

各ビルドは `NEXT_PUBLIC_BUILD_ID` をService Worker URLの `v` クエリへ反映する。有効化時は同じアプリシェルprefixを持つ旧版だけを削除し、他用途のキャッシュは保持する。

`beforeinstallprompt` はインストール画面の描画前に発生し得るため、`platform-browser-adapter` が読み込み時にイベントを購読し、単回利用のpromptをアプリ全体で保持する。composition root はアダプタをモジュールの先頭で import する。無印版はインストール画面に `BrowserStorageInstallPage` を使い、追加済みでないときだけ、ブラウザのまま使うとデータが消えることがある旨（Safari では 7 日ほど開かないと消える）を操作の下に小さく出す。データを残さないデモ版・Sim版と、クラウドに置く版は `InstallPage`（注意書きなし）を使う。無印版のインストール画面は帳簿を開かずに出す (`OpenkkStartProviders`)。別のタブでアプリを開いていても待たない。

## テスト戦略

| レイヤー          | ツール     | 対象                                                                                                                                                                                                                   |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ユニット          | vitest     | ドメインロジック・パーサー・DB adapter                                                                                                                                                                                 |
| DB ポート契約適合 | vitest     | `OpenkkDbPort` 共有 conformance（`server-ports/test-support/db-port-conformance.ts`）を memory / file-db / node-sqlite / document / books の各アダプタ＋遅延非同期コアに通し、保存先が違っても挙動が一致することを保証 |
| E2E               | Playwright | Sim版の操作フローと、無印版・デモ版の静的export・帳簿の置き場。締めフローでは仮帳票＝確定帳票＝概要図を実画面で検証                                                                                                    |
| パッケージ構造    | vitest     | workspace 整合性チェック                                                                                                                                                                                               |

`npm run test:e2e` は Sim版を専用 port 4306 で起動し、既存プロセスを再利用せず実行する。`npm run test:e2e:export` は無印版を静的exportして検査する。無印版のテスト (`tests-export`) は、初回の説明を見たことにしてから始める (`startApp`)。保存・取り込み・前の版からの移行は `books.spec.ts` にあり、保存したファイルや取り込むファイルは `node-sqlite-db-adapter` (openkk-cli と同じ道) で読み書きして確かめる。前の版の帳簿は、前の版と同じスキーマ (5) の DB を作り、テストの中で SQLite Wasm を読み込んで、前の版と同じ開き方で OPFS に置いて試す。静的exportを配るテスト用のサーバー (`e2e/serve-export.mjs`) は、本番 (Firebase Hosting) と同じく末尾の `/` がないフォルダの URL を `/` 付きへ移す。生成物・全workspace・全アプリ・E2Eをまとめた検査は `npm run check:full` で実行できる。
このリポジトリに `OpenkkDbPort` 実装を追加したら `runDbPortConformance` に通すこと。conformance は `server-ports/test-support/` にあり npm には公開しないので、外部の実装はこのリポジトリを参照する。
