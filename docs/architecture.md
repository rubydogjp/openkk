# Architecture

オープン会計 の箱 (パッケージ) の種類、箱の中の層、依存の向きの解説。
依存グラフ: [`dependency-graph.md`](./dependency-graph.md)
API 契約: [`api-contract.md`](./api-contract.md)
SQLite スキーマ: [`database-schema.md`](./database-schema.md)

## 箱の種類

ここに出る名前は、すべて openkk の中の名前で、npm では `@rubydogjp/openkk-<箱の名前>` になる。箱は 5 種類あり、名前を見ればどの種類かが決まる。技術の名前 (React・Next・HTTP など) は箱の名前に入れない。

| 種類        | 名前                                | 役割                                                                                                     |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. 中身     | `driver`・`engine`                  | 決まりと手続きと、外に求める口。入口の形も、動かす場所も知らない。`driver` が使う側、`engine` が受ける側 |
| 2. 入口     | `frontend-<種類>`・`backend-<種類>` | 中身を、ある形で受けるもの。種類は `ui` (画面)・`cli` (コマンド)・`api` (呼び出し)。場所は知らない       |
| 3. 動く形   | `client-<環境>`・`server-<環境>`    | 入口を、ある環境で動かすための薄い箱                                                                     |
| 4. 口の実装 | `<相手>-<口>-adapter`               | 中身が外に求める口の実装。`<口>` は中身の ports にある名前、`<相手>` はつなぐ先                          |
| 5. 製品     | `bundle-<名前>`                     | 動く形と、口の実装と、設定を選んで束ねたもの。利用者から見た 1 つの製品                                  |

- `engine` は、記録して答える本体。埋め込んでも、サーバーの後ろに置いても動く。`driver` は、それを操る側の中身で、帳票の組み立てなどの決まりを持つ。
- `frontend`・`backend` は、中身の外に向いた面の名前で、環境に依存しない。`client`・`server` は、ある環境で動いているものの名前。無印版は `engine` を同じプロセスで呼ぶので、`server-*` がない。
- 製品 (版) の呼び名は bundle にそろえる。全体の呼び名は openkk、コマンドラインの道具は openkk-cli (コマンドは `openkk`)。

```
packages/
├── driver                    中身 (使う側) — domain: 型と計算 (集計・帳票・減価償却・CSV)。usecases: 手続きと共有する状態。ports: backend・print・platform・book-files
├── engine                    中身 (受ける側) — domain: 記録の決まり。usecases: 記録の操作と持ち主の確かめ。ports: db
│
├── frontend-ui               入口 (画面) — React の画面とデザイントークン。bindings/ に、driver の共有する状態を画面に結ぶ Context と hook
├── frontend-cli              入口 (コマンド) — openkk-cli のコマンドの表。コマンドとそのオプション、文字での出力。端末もファイルも知らない
├── backend-api               入口 (呼び出し) — 契約の型 (contract.ts) と、入力を確かめて engine の usecases を呼ぶ OpenkkBackendApi
│
├── client-browser            動く形 — frontend-ui をブラウザ (Next.js・PWA) で動かす配線。共有する状態を作り、画面の移動を Next で実装する
├── client-terminal           動く形 — frontend-cli を端末 (Node.js) で動かす。引数の読み取り・ファイル・出力・終了コード
│
├── embedded-backend-adapter  口 backend の実装 — 同じプロセスの backend-api を、HTTP と同じ形の受け渡しで呼ぶ
├── browser-print-adapter     口 print の実装 — ブラウザの印刷
├── browser-platform-adapter  口 platform の実装 — PWA・localStorage・ダウンロードなどブラウザの機能と、帳簿の置き場 (OPFS)
├── local-book-files-adapter  口 book-files の実装 — 帳簿をファイルへ保存する・ファイルから取り込む（無印版）
│
├── sqlite-db-adapter         口 db の共通の実装 — SQL・保存処理・マイグレーション・最後に変えた時刻の記録
├── memory-db-adapter         口 db の実装 — メモリの上の SQLite Wasm（Sim版・デモ版）
├── book-db-adapter           口 db の実装 — 帳簿 1 冊 (.openkk のバイト列) をメモリ上に開き、変更を知らせる
├── books-db-adapter          口 db の実装 — 会計期間ごとの帳簿 (.openkk) に振り分け、変わった帳簿を置き場へ保存する（無印版）
├── disk-db-adapter           口 db の実装 — ディスクの上の .openkk を node:sqlite で開く（openkk-cli 用・ベータ）
├── legacy-db-adapter         口 db の実装 — 26.3 までの OPFS の DB (SQLite Wasm + SAHPool)。無印版が前の版の帳簿を移すときに読む
│
├── bundle-original           製品 — 無印版（会計期間ごとの帳簿をブラウザの中に置き、「保存」でファイルに書き出す）
├── bundle-sim                製品 — Sim版（memory DB・固定時計・debug）
├── bundle-demo               製品 — デモ版（seed 済み memory DB・再読み込みで初期化）
└── bundle-cli                製品 — openkk-cli（ベータ。コマンドは openkk。ディスクの上の .openkk を操作する）
```

箱の名前と依存は `test/package-structure.test.ts` が確かめる。どの箱も今は `private: true` で、npm へは出さない ([`release.md`](./release.md))。

## 設計原則

### 1. 使う側と受ける側を分ける

使う側 (`driver`・`frontend-*`・`client-*`) と受ける側 (`engine`・`backend-*`・`server-*`) は、互いのコードを読み込まない。つながるのは `driver` の口 backend (`OpenkkBackendPort`) と `backend-api` の間だけ。FiscalPeriod など共通する概念は両側で独立に定義する。

契約の型は、使う側が `driver/src/ports/backend/types.ts`、受ける側が `backend-api/src/contract.ts` に持つ。構造のテストが、名前・本文・エンドポイントの食い違いを見つける。

両側を知ってよいのは、同じプロセスでつなぐ口の実装 (`embedded-backend-adapter`・`local-book-files-adapter`) と、製品だけ。

口 backend の実装が守ることは、`driver` の契約テスト (`@rubydogjp/openkk-driver/backend-contract` の `BACKEND_CONTRACT_CASES`) に書いてある。マスターデータ・会計期間・仕訳・固定資産・仮締めと本締め・次期の作成について、口 backend だけを通して確かめる。本締めでは、使う側が作った締めの仕訳 (`buildFinalClosingPayload`) を受ける側が受け入れることまで見る。テストの枠組みに頼らない関数の並びなので、どの実装でも「空の利用者で開く」関数を渡せば通せる。このリポジトリでは、埋め込み (`embedded-backend-adapter` + `memory-db-adapter`) と、ディスクの上の帳簿 (`bundle-cli`) に通している。HTTP 越しの実装も同じものに通す。

### 2. 口と実装

中身の箱が外に求めるものは、すべて口 (port) として interface で定める。実装の箱は `<相手>-<口>-adapter` と名付ける。

| 口         | Interface             | 定める箱 | 実装の箱                                                                                                                                  |
| ---------- | --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| backend    | `OpenkkBackendPort`   | `driver` | `embedded-backend-adapter`                                                                                                                |
| print      | `PrintPort`           | `driver` | `browser-print-adapter`                                                                                                                   |
| platform   | `PlatformPort`        | `driver` | `browser-platform-adapter`                                                                                                                |
| book-files | `OpenkkBookFilesPort` | `driver` | `local-book-files-adapter`                                                                                                                |
| db         | `OpenkkDbPort`        | `engine` | `memory-db-adapter` / `books-db-adapter` / `book-db-adapter` / `disk-db-adapter` / `legacy-db-adapter` (共通の実装は `sqlite-db-adapter`) |

HTTP 越しのバックエンドは、`embedded-backend-adapter` と同じ位置で口 backend を実装して差し替える。

実行環境に依存する機能は口 platform に集める。対象はアプリのインストール、オフラインキャッシュの登録、key-value 保存、ファイル保存、外部URL・認証リダイレクトの遷移。画面は `usePlatformAdapter` 経由で、手続きは渡された口を通して呼び、`window` や `navigator` を直接触らない。ネイティブアプリなど別の環境で動かす場合は `browser-platform-adapter` と同じ位置に実装を足し、`createOpenkkDriver` に渡す。ポップオーバーの外側クリック検知など、Web ビューである限り共通の DOM 操作は画面に残す。

製品ごとに足す機能は口として足し、ない製品では `null` を渡す。帳簿をファイルに保存する・取り込む (`OpenkkBookFilesPort`) は無印版だけが持つ。

### 3. 箱の中は 4 層

使う側も受ける側も、同じ 4 層で説明できる。interfaces の層にあたるのが入口の箱で、残りの 3 層は中身の箱の中にある。

| 層         | 役割                             | 使う側                        | 受ける側              |
| ---------- | -------------------------------- | ----------------------------- | --------------------- |
| interfaces | 呼ばれる入口                     | `frontend-ui`・`frontend-cli` | `backend-api`         |
| usecases   | 手続き                           | `driver/src/usecases`         | `engine/src/usecases` |
| domain     | 決まり。何も呼ばない             | `driver/src/domain`           | `engine/src/domain`   |
| ports      | 外に求める口。実装は口の実装の箱 | `driver/src/ports`            | `engine/src/ports`    |

```
interfaces → usecases → domain
             usecases → ports
```

- 中身の箱 (`driver`・`engine`) は、フレームワークも環境の仕組みも持たない (依存するパッケージがない)。
- 入口の箱には、その形のための技術が入る (`frontend-ui` の React)。動く形と口の実装には、環境の仕組みが入る。
- `frontend-ui` は Next を読み込まない。画面の移動 (今いる場所・移る・リンク) は `OpenkkRouting` という形で動く形の箱に求め、`OpenkkRoutingProvider` で受け取る。`client-browser` が Next で実装する (`nextRouting`)。
- 層の向きは、箱の中のフォルダ (`domain`・`ports`・`usecases`、`frontend-ui` の `bindings`) を見て構造のテストが確かめる。

### 使う側の手続きと、共有する状態

`driver/src/usecases` は 2 種類のものを持つ。どちらも React を知らない。

- **状態を持たない関数**: 利用者のひとまとまりの作業 (`loadJournalMaster`・`loadEntryRecords`・`loadFiscalPeriodReportInput`・`applyJournalTableChanges`・`importEntryRecords`・`buildFiscalPeriodArchiveZip`・`carryOverFromBackend` など)。口 backend を受け取って呼ぶ。どの製品も同じものを使い、`frontend-cli` はこれを直接呼ぶ。仕訳のファイルの取り込み方を決める `planJournalImport`、書き出しの `formatJournalExport`、本締めの仕訳を作る `buildFinalClosingPayload` は、画面とコマンドが同じものを呼ぶ。
- **入れ物 (共有する状態)**: 上の関数を包み、結果を覚えておく。形は `{ getState(), subscribe(listener) }` (`ReadableState`)。`getState()` は、覚えているデータと、そのデータを読む関数と、操作をまとめた 1 つの値を返し、中身が変わるまで同じ値を返す。
  - `today` (日付。日が変わると知らせる)
  - `maintenance` (メンテナンスの状態。口 backend を包んで、メンテナンスの誤りを見張る)
  - `app` (利用者・会計期間の一覧・選んでいる期間。口 backend を包んで、401 でサインアウトに戻す)
  - `entries`・`assist` (`app` の変化を聞いて、仕訳・固定資産を読み込み直す)

`createOpenkkDriver(config, { backend, platform, print, bookFiles })` が入れ物を作ってつなぐ。作るだけでは何も呼ばない。`start()` で、保存してある値 (利用者・選んでいた期間) を読み戻して読み込みを始め、止める関数を返す。共有する状態を作るのは製品の側で、ブラウザの製品では `client-browser` の `OpenkkAppProviders` が作る。openkk-cli は作らない。

`frontend-ui/src/bindings` は、入れ物を React に結ぶだけの薄い層にする。`OpenkkDriverProvider` が driver を Context に入れて `start()` し、`useOpenkkAppState`・`useOpenkkEntries`・`useOpenkkAssist`・`useMaintenance` などの hook が `useSyncExternalStore` で入れ物を読む。手続きや非同期の処理は置かない (構造のテストが確かめる)。ブランド (`BrandConfig`) と差し込みの表示 (callout) は画面の設定なので、React の Context のまま `frontend-ui` に置く。

### 4. どの製品も同じ並びで作る

クラウドに置く版 (HTTP 越しの独自バックエンド) と、手元に置く版 (無印版・openkk-cli) は、同じ箱の並びで作る。違うのは口 backend の実装 (HTTP か同じプロセスか) と、受ける側を実装する言語だけで、それぞれの段の役割は変えない。

```
クラウド版:  画面 → 口 backend → HTTP の実装               → サーバー (呼び出しの入口・手続き) → 保存先 (サーバーの DB)
無印版:      画面 → 口 backend → embedded-backend-adapter → backend-api → engine → 口 db (books-db-adapter → ブラウザの中の帳簿)
openkk-cli:  コマンド → 口 backend → embedded-backend-adapter → backend-api → engine → 口 db (disk-db-adapter → .openkk ファイル)
```

- 使う側は保存先の形を知らない。無印版が会計期間ごとに帳簿のファイルを分けているのは口 db の実装の中の話で、期間の一覧・追加・次期の作成・引き継ぎは、どの製品でも同じ `OpenkkBackendPort` の呼び出しになる。
- 製品は、動く形と口の実装を選んでつなぐだけにする。埋め込みの製品は `createOpenkkBackendApi(db, config)` で受ける側を組み立て、`createOpenkkEmbeddedBackendAdapter` で口 backend につなぐ。openkk-cli (`bundle-cli`) は、`client-terminal` に帳簿の開き方 (`disk-db-adapter` → `backend-api` → `embedded-backend-adapter`) と既定値を渡して動かす。
- `frontend-cli` は Node の機能を読み込まない。ファイルの読み書きと、別の帳簿を開くことは、`client-terminal` から受け取る (`CliFiles`・`CliBooks`)。

設定は `OpenkkConfig` に定義し、画面では `useOpenkkConfig` で取得する。日付は `useOpenkkToday` で購読する。

## 認証について

ユーザーは `OpenkkUser = EmbeddedUser | CustomUser`（`driver` の `user.ts`）でドメインモデル化する。`config.authMode` で挙動を選ぶ：

- `embedded`（sim/demo/original の既定）: 固定の `EmbeddedUser` 1名で起動時に自動サインイン。サインアウトは非活性（`userCanSignOut` が `false`）。`engine` の usecases の auth は embedded 単一ユーザー向け local 実装。
- `custom`: Google 認証等で実ユーザー（`CustomUser`）を扱う派生プロダクト向け。独自バックエンドは `OpenkkBackendApi.auth` を実装し、`RedeemCompletionCodeResponse` の未設定値を `null` で返す。

実装手順は [`authentication.md`](./authentication.md) を参照。

### 所有者チェックの責務

所有者検証は `engine` の usecases の不変条件とする。会計期間に紐づくリソース（entries / fixedAssets / closings 等）は、対象 fiscal period または対象エンティティの `userId` を確認してから DB 操作へ進む。所有者の異なるリソースも不存在と同じエラーにし、識別子の有無を他ユーザーへ漏らさない。

`backend-api` でも、URL 上の fiscal period と子リソースの所属関係、会計期間のフェーズ、入力形式を検証する。これは呼び出しの境界の検証であり、`engine` の所有者検証を省略する理由にはしない。これにより `engine` の usecases を直接使う独自の入口でも同じ所有者境界が保たれる。

会計期間のパッチ可否・仕訳・固定資産・期首残高の入力規則そのものは `engine` の domain が持ち、呼び出しの境界（`backend-api`）と DB 境界（`sqlite-db-adapter`）の両方がそこを呼ぶ。境界ごとに検証しつつ規則は一箇所に保つ。
境界の検証関数は入力を `unknown` で受け取り assertion signature で型を絞る。型が付いた引数は検証済みを意味する。

本締め時は `engine` の usecases が保存済みデータを取得し、domain で生成仕訳を再計算・照合する。本締め後の帳票・分析は保存済み仕訳を使う。

## DB スキーマとマイグレーション

`engine` の ports にDB操作契約と保存の型を置く。SQL・保存処理・DDLは `sqlite-db-adapter` が担当する。テーブル構造は [`database-schema.md`](./database-schema.md) を参照。

`legacy-db-adapter`・`memory-db-adapter` は `sqlite-db-adapter` を利用し、起動時に `runMigrations()` を呼ぶ。`legacy-db-adapter` の OPFS SAHPool VFS は1ファイルを1接続でしか開けないため、Web Locks で1タブに限定し、同一プロセス内ではアダプタを1つだけ生成する。ロックは時間で打ち切らず、取れなければ `onWaitingForAnotherTab` で画面に知らせたうえで解放を待つ。別のタブを閉じる、または再読み込みで前の文書が片付くと、そのまま起動が続く。DB を開けたら、ストレージが足りないときなどにブラウザがデータを消さないよう `navigator.storage.persist()` で求める（すでに許可されていれば求めない。Firefox では確認が出るため、結果は待たずに起動を続ける）。起動の段階は `<html data-openkk-boot>`（`starting` / `waiting-for-another-tab` / `ready` / `failed`）に出し、無印版は帳簿の保存の状態を `<html data-openkk-storage>` に出す。E2E は待ち時間ではなくこれらの属性の変化を待つ (画面を移るときは、保存が終わってから移る)。DB実装を差し替える場合は `OpenkkDbPort` を実装し、DDLはその実装内で管理する。

SQLite の単一接続では、トランザクションへ別操作が混入しないよう読取を含む公開ポート呼出しを直列化する。直列化は `engine` の `serializePortOperations` が担い、`OpenkkDbPort` の実装と `backend-api` の両方で使う。

エントリの取込み（`importMany`）は `localId` 単位で冪等で、同一 fiscal period に既存の `localId` はスキップされる。バルク挿入はトランザクションで囲まれ、途中失敗時はロールバックされる。

仕訳の表 (CSV) の取り込みは置き換えで、仕訳番号で突き合わせた削除・更新・追加を順に呼ぶ (`journalTableOperations`)。全体を 1 つのトランザクションにはしないが、同じ CSV をもう一度取り込めば残りだけが反映される。

## 帳簿のファイル（無印版）

無印版は、データをブラウザの中 (OPFS の `openkk-books/`) に置く。置き方は環境で変えない。1 つの会計期間を 1 冊の帳簿 (`.openkk`、中身は SQLite) にし、利用者は左上の「保存」でその期間の帳簿をファイルに書き出す。同じファイルを openkk-cli でも扱える。部品は次の順につながる。

- `book-db-adapter`: 帳簿 1 冊のバイト列を SQLite Wasm のメモリ上に開き (`sqlite3_deserialize`)、`OpenkkDbPort` を返す。書き込みのあった操作のあとに `onChange` で知らせ、`exportBytes()` で全体をバイト列に戻す。オープン会計の帳簿でない SQLite と、新しすぎるスキーマは開かない。
- `books-db-adapter`: 置き場 (`BookStore`: `list` / `read` / `write` / `remove`) にある帳簿をすべて開き、1 つの `OpenkkDbPort` にまとめる。期間の ID で帳簿に振り分け、期間の作成・圧縮済みファイルの取り込みは新しい帳簿を作り、期間の削除は帳簿を消す。日付の重なりは帳簿をまたいで確かめる。次期の作成 (`createNext`) と引き継ぎの上書き (`applyCarryover`) は、引き継ぎ元の帳簿を読んで圧縮保存と同じ形にし、引き継ぎ先の帳簿の `applyCarryoverFromArchive` に渡す。`runDbPortConformance` に通してあり、1 つの DB に全期間を置く実装と同じ振る舞いになる。
- 変わった帳簿は、操作のあとに置き場へ丸ごと保存する (書き出しを重ねず、最新だけ)。新しい帳簿の作成・削除・置き換えは、置き場に書けてから操作を終える。保存の状態 (`saved` / `saving` / `failed`) は `<html data-openkk-storage>` に出し、保存できなかったときは上の帯で知らせる。保存が済む前にページを離れようとすると、ブラウザの確かめを出す。
- 帳簿を読むのも書くのも 1 つの順番待ち (`operation-queue.ts`) を通す。書き出し (`exportBytes`) を別の操作のトランザクションの途中に挟まないため。
- 読めない帳簿 (壊れている・新しい版で作られた) は飛ばして起動し、ファイルは消さずに残す。件数を上の帯で知らせる。
- `browser-platform-adapter` の `inAppBookStore`: OPFS に `BookStore` を実装する。書き込みは worker の sync access handle で行う (Safari でも書けるように)。手順は `in-app-book-protocol.ts` にあり、控え (`.next`) を書き切ってから「準備済み」の印 (`.ready`) を置き、本体を書いてから両方を消す。一覧を読むときに印や控えが残っていれば、印があれば本体を控えで戻し、控えだけなら控えを消す (初めての保存の途中で止まった帳簿も、ここで仕上げるか捨てる)。帳簿のファイル名は中身と関係のない一意な名前で、どの期間の帳簿かは中身から読む。
- 同じブラウザでは 1 つのタブでだけ動かす。起動するときに Web Lock (`openkk-books`) を取り、取れなければ別のタブが閉じるのを待つ (`waiting-for-another-tab`)。Web Locks のないブラウザでは起動しない。起動したら `navigator.storage.persist()` を求める。

### 最後に変えた時刻

帳簿は `openkk_meta` の `last_changed_at` (ミリ秒) に、最後に中身を変えた時刻を持つ。`sqlite-db-adapter` の `runInTransaction` が、行を変えたトランザクションの中で更新する (前の値より必ず大きくする)。同じ層を通る openkk-cli の変更でも更新される。読むだけの操作と、失敗して巻き戻った操作では変わらない。

### ファイルに保存する・取り込む

`local-book-files-adapter` が `OpenkkBookFilesPort` を実装し、画面は `useOpenkkBookFile` / `useOpenkkBookFiles` で使う。ほかの版は `bookFiles: null`。

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

26.3 までの無印版は、すべての期間を OPFS の SAHPool (`.openkk/` の `/openkk.sqlite3`) の 1 つの DB に置いていた。新しい版は起動するとき、その DB を `exportLegacyDbBytes` (`legacy-db-adapter`) で書き出し、期間ごとの帳簿に分けて (`splitBookFile`) 置き場に書く (`packages/bundle-original/app/legacy-book.ts`)。期間の ID は変えない。

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

`beforeinstallprompt` はインストール画面の描画前に発生し得るため、`browser-platform-adapter` が読み込み時にイベントを購読し、単回利用のpromptをアプリ全体で保持する。`client-browser` はアダプタをモジュールの先頭で import する。無印版はインストール画面に `BrowserStorageInstallPage` を使い、追加済みでないときだけ、ブラウザのまま使うとデータが消えることがある旨（Safari では 7 日ほど開かないと消える）を操作の下に小さく出す。データを残さないデモ版・Sim版と、クラウドに置く版は `InstallPage`（注意書きなし）を使う。無印版のインストール画面は帳簿を開かずに出す (`OpenkkStartProviders`)。別のタブでアプリを開いていても待たない。

## テスト戦略

| レイヤー          | ツール     | 対象                                                                                                                                                                                                             |
| ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ユニット          | vitest     | ドメインロジック・パーサー・DB adapter                                                                                                                                                                           |
| DB ポート契約適合 | vitest     | `OpenkkDbPort` 共有 conformance（`engine/test-support/db-port-conformance.ts`）を memory / file-db / node-sqlite / document / books の各アダプタ＋遅延非同期コアに通し、保存先が違っても挙動が一致することを保証 |
| E2E               | Playwright | Sim版の操作フローと、無印版・デモ版の静的export・帳簿の置き場。締めフローでは仮帳票＝確定帳票＝概要図を実画面で検証                                                                                              |
| パッケージ構造    | vitest     | workspace 整合性チェック                                                                                                                                                                                         |
| 口 backend の契約 | vitest     | `BACKEND_CONTRACT_CASES` を、埋め込みの実装とディスクの上の帳簿に通す                                                                                                                                            |

`npm run test:e2e` は Sim版を専用 port 4306 で起動し、既存プロセスを再利用せず実行する。`npm run test:e2e:export` は無印版を静的exportして検査する。無印版のテスト (`tests-export`) は、初回の説明を見たことにしてから始める (`startApp`)。保存・取り込み・前の版からの移行は `books.spec.ts` にあり、保存したファイルや取り込むファイルは `disk-db-adapter` (openkk-cli と同じ道) で読み書きして確かめる。前の版の帳簿は、前の版と同じスキーマ (5) の DB を作り、テストの中で SQLite Wasm を読み込んで、前の版と同じ開き方で OPFS に置いて試す。静的exportを配るテスト用のサーバー (`e2e/serve-export.mjs`) は、本番 (Firebase Hosting) と同じく末尾の `/` がないフォルダの URL を `/` 付きへ移す。生成物・全workspace・全アプリ・E2Eをまとめた検査は `npm run check:full` で実行できる。
このリポジトリに `OpenkkDbPort` 実装を追加したら `runDbPortConformance` に通すこと。conformance は `engine/test-support/` にあり npm には公開しないので、外部の実装はこのリポジトリを参照する。
