# openkk-cli (ベータ) の設計

呼び名: 全体 (形式・契約・アプリ・コマンド) を openkk、コマンドラインの道具を openkk-cli と呼ぶ。製品の箱は `bundle-cli`、コマンドは `openkk`。openkk-cli は端末の中の道具で、無印版 (ブラウザのアプリ) を起動しない。

状態: ベータ。OSS に入れておくだけで、告知はしない。npm には出さない ([`release.md`](./release.md))。下の「進め方」の 1〜6 (`disk-db-adapter`、コマンドの `init`・`periods`・`opening`・`entries`・`report`・`closing`・`archive`) まで実装済みで、期首のBSから本締め・次の期間まで CLI だけで回せる。再振替の選択と固定資産の操作はまだ Web 版だけ。

## 結論

- 作業用のストアは **SQLite ファイル** (`.openkk`、既定は `book.openkk`)。無印版 (`packages/bundle-original`) の帳簿と同じ形式で、無印版が「保存」で書き出したファイルをそのまま扱い、変えたファイルを無印版に取り込める。zip は会計期間単位の受け渡し (import / export) に使う
- openkk-cli は画面の製品と同じ並びで作る。違うのは保存先 (口 db の実装) だけ ([`architecture.md`](./architecture.md) の「どの製品も同じ並びで作る」)。`backend-api` と `embedded-backend-adapter` を同じプロセスでつなぎ、`OpenkkBackendPort` 経由で呼ぶ

## ファイル形式

### SQLite ファイルを作業用にする理由

- `sqlite-db-adapter` が DB に求めるのは `SqlDb.exec` (`sqlite-db-adapter/src/sql-db.ts`) と、マイグレーション用の `selectValue` / `exec` (`migrate.ts`) だけ。Node の `node:sqlite` (`DatabaseSync`) に 40〜60 行のシムを被せれば、SQL・マイグレーション・保存処理をブラウザ版とそのまま共有できる
  - `rowMode: "array"` は `setReturnArrays(true)` で再現する
  - boolean の bind は 0/1 に変換する
  - 複数文の DDL は `db.exec(sql)` で流す
- better-sqlite3 はネイティブビルドが要るので使わない。sqlite-wasm を Node で使う案は、ファイル VFS がなく毎回ファイル全体を読み書きすることになるので、予備に留める

### zip を作業用にしない理由

- zip (`driver/src/domain/archive/fiscal-period-archive.ts`) は 1 期間分の JSON。取り込むと完了済みの期間として復元される受け渡し用の形式で、日々書き換える用途に向かない
- ブラウザ版を変えずに CLI との間でデータを移せるのは、今は zip と仕訳の CSV / JSON だけ。ベータの持ち運び手段はこれにする

### 無印版との行き来

- 無印版は会計期間ごとに 1 冊の帳簿 (`.openkk`) をブラウザの中に置く。左上の「保存」で `<期間名>.openkk` として書き出し、期間の選択の「ファイル」から取り込む。openkk-cli はそのファイルを `--file` で開く
- 行き来は「無印版で保存 → openkk-cli で変える → 無印版に取り込む」。無印版はファイルを見張らないので、取り込むまで無印版の中は変わらない
- 帳簿は `openkk_meta` の `last_changed_at` に最後に変えた時刻を持ち、openkk-cli の変更でも更新される (`sqlite-db-adapter` の共通の層で記録する)。無印版は取り込むときにこの値を見て、「アプリの外で変更がありました」と、無印版の側の保存していない変更が失われることを知らせる
- 取り込みは期間の ID で同じ期間を見分けて置き換える。`archive import` や `periods export` は期間の ID を付け直すので、無印版から見ると別に作られた期間になる (同じ日付なら、確かめたうえで帳簿ごと置き換える)。無印版に戻すつもりのファイルは、保存したファイルをそのまま変える
- 複数の期間を入れたファイルも取り込める。無印版が期間ごとの帳簿に分ける
- 無印版のデータは userId `openkk-original-user` で保存されている (`packages/bundle-original/app/openkk-config.ts`)。openkk-cli も同じ userId を既定にする。ほかの userId の期間は無印版に取り込まれない
- 26.3 までの無印版は OPFS SAHPool VFS (`legacy-db-adapter`) の 1 つの DB に置いていた。プール内のファイルは独自ヘッダ付きなのでそのままは使えず、新しい無印版が起動するときに `exportLegacyDbBytes` で標準の SQLite として読み、期間ごとの帳簿に分けて移す

## パッケージ構成

箱の種類 ([`architecture.md`](./architecture.md)) に合わせて、入口・動く形・製品の 3 つに分ける。

| 箱                           | 位置づけ                                                                          | 依存                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `frontend-cli`               | 入口 (コマンド)。コマンドの表・オプション・文字での出力。端末もファイルも知らない | `driver`                                                                                        |
| `client-terminal`            | 動く形。端末 (Node.js) で動かす。引数の読み取り・ファイル・出力・終了コード       | `driver`, `frontend-cli`                                                                        |
| `bundle-cli` (bin: `openkk`) | 製品。帳簿の開き方と既定値を選んで束ねる                                          | `frontend-cli`, `client-terminal`, `backend-api`, `embedded-backend-adapter`, `disk-db-adapter` |
| `disk-db-adapter`            | 口 db の実装 (memory・books と並ぶ)                                               | `engine`, `sqlite-db-adapter`                                                                   |

- `frontend-cli` は Node の機能 (`node:fs` など) を読み込まない。ファイルの読み書き (`CliFiles`) と帳簿を開くこと (`CliBooks`) は、`client-terminal` から受け取る
- `frontend-ui` には依存しない (React を引き込むため)
- `OpenkkBackendApi` を直接呼ばない。帳票・CSV・zip・締め仕訳は使う側 (`driver`) の型で書かれていて、直接呼ぶと使う側と受ける側の型が混ざる (設計原則 1)。`OpenkkBackendPort` 経由なら、HTTP のバックエンドにも差し替えられる
- 手続きは `driver` の usecases にある関数を呼ぶ (`loadJournalMaster`・`loadEntryRecords`・`loadFiscalPeriodReportInput`・`planJournalImport`・`applyJournalTableChanges`・`buildFinalClosingPayload`・`carryOverFromBackend` など)。画面と同じ関数なので、取り込みの決まりや本締めの仕訳が食い違わない

### 切り出しが要るもの

帳票 HTML (`driver/src/domain/print/*`)・CSV / JSON・zip は `driver` の domain の純粋関数なので、Node でもそのまま使える。React の hook の中にある組み立てだけ、`driver` へ移す。

- `frontend-ui/src/steps/use-step-documents.ts` の締め仕訳と帳票 3 点の生成 → `buildFiscalPeriodDocuments()` など
- `frontend-ui/src/steps/bodies/closing.tsx` の本締め用の仕訳準備 (`prepareAssistEntriesForFinalClosing`)

本締めは使う側が作った仕訳を受ける側が照合する設計なので、この切り出しが済むまで CLI から本締めはできない。

## ベータのコマンド

共通: `--file <path>` (または `OPENKK_FILE`)、`--user` (既定 `openkk-original-user`)

```
openkk init
openkk periods list | show | create --name --start --end
openkk entries list [--json] | add | import <file.csv> [--yes] | export   # CSV は表の形。import は置き換えで、--yes がなければ違いだけ出す (JSON は非推奨)
openkk report journal|ledger|fs --out <file.html>
openkk archive import <zip>                          # 以前の圧縮済みファイルを取り込む (レガシー。書き出しは periods export で .openkk に)
openkk opening show | set <期間id> <科目>=<金額> ...
openkk closing pre | cancel | final <期間id> [--yes]
openkk periods receive | next <期間id>
openkk periods next <期間id> --out <file.openkk>   # 次の期間を新しいファイルに作る (本締め・書類の受け取り済みなら引き継ぐ)
openkk opening carry <期間id> --from <file.openkk> [--from-period <id>]   # 別のファイルの期間から引き継ぐ (上書き)
openkk periods export <期間id> [--out <file.openkk>]   # その期間だけを入れた帳簿ファイルを作る (1 期間 = 1 ファイル)
```

## 進め方

1. `disk-db-adapter` を作り、`runDbPortConformance` を一時ファイルと `:memory:` の両方で通す。開き直しても残ること、新しすぎるスキーマを拒否することもテストする
2. コマンドの土台 (`node:util` の `parseArgs`、`init`・`periods`)
3. `entries` (`driver` の CSV / JSON 関数を使い、往復テストを付ける)
4. 帳票の組み立てを `driver` へ切り出し、`frontend-ui` をそれに置き換えて `report` を足す
5. `archive export / import` (ブラウザで作った zip を取り込めることをテストする)
6. `opening`・`closing`・`periods receive` / `next`
7. 無印版に帳簿ファイルの保存・取り込みを付ける (済み。上の「無印版との行き来」)

箱を足すときは、ルートの workspaces、`test/package-structure.test.ts` の `allowedBoxes`、`npm run gen-deps` (`docs/dependency-graph.md`)、`docs/architecture.md` の箱の一覧と口の表も更新する。
