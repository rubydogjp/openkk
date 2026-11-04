# CLI 版 (ベータ) の設計

状態: ベータ。OSS に入れておくだけで、告知はしない。`cli` と `node-sqlite-db-adapter` は `private: true` で npm には出さない (出すときは外し、`docs/release.md` の初回 publish と Trusted Publishing の設定をする)。下の「進め方」の 1〜5 (`node-sqlite-db-adapter`、`cli` の `init`・`periods`・`entries`・`report`・`archive`) まで実装済み。

## 結論

- 作業用のストアは **SQLite ファイル** (`openkk.sqlite3`)。zip は会計期間単位の受け渡し (import / export) に使う
- CLI は UI と同じく **composition root** として足す。`embedded-backend` → `embedded-backend-adapter` を同じプロセスでつなぎ、`OpenkkBackendPort` 経由で呼ぶ

## ファイル形式

### SQLite ファイルを作業用にする理由

- `sqlite-adapter` が DB に求めるのは `SqlDb.exec` (`sqlite-adapter/src/sql-db.ts`) と、マイグレーション用の `selectValue` / `exec` (`migrate.ts`) だけ。Node の `node:sqlite` (`DatabaseSync`) に 40〜60 行のシムを被せれば、SQL・マイグレーション・保存処理をブラウザ版とそのまま共有できる
  - `rowMode: "array"` は `setReturnArrays(true)` で再現する
  - boolean の bind は 0/1 に変換する
  - 複数文の DDL は `db.exec(sql)` で流す
- better-sqlite3 はネイティブビルドが要るので使わない。sqlite-wasm を Node で使う案は、ファイル VFS がなく毎回ファイル全体を読み書きすることになるので、予備に留める

### zip を作業用にしない理由

- zip (`client-domain/src/archive/fiscal-period-archive.ts`) は 1 期間分の JSON。取り込むと完了済みの期間として復元される受け渡し用の形式で、日々書き換える用途に向かない
- ブラウザ版を変えずに CLI との間でデータを移せるのは、今は zip と仕訳の CSV / JSON だけ。ベータの持ち運び手段はこれにする

### ブラウザの DB ファイルとの関係

- ブラウザ版は OPFS SAHPool VFS (`file-db-adapter/src/sqlite.worker.ts`) に保存していて、プール内のファイルは独自ヘッダ付きなので、そのままコピーしては使えない。スキーマ (`SCHEMA_MIGRATIONS`) は同一なので、worker に `exportFile` / `importDb` を足せば標準の SQLite ファイルとして出し入れできる (ベータの後)
- 無印版のデータは userId `openkk-original-user` で保存されている (`packages/openkk/app/openkk-config.ts`)。CLI も同じ userId を既定にする

## パッケージ構成

| パッケージ                                 | 位置づけ                                 | 依存                                                                                                      |
| ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@rubydogjp/openkk-node-sqlite-db-adapter` | `OpenkkDbPort` 実装 (file/memory と並ぶ) | `server-ports`, `sqlite-adapter`                                                                          |
| `@rubydogjp/openkk-cli` (bin: `openkk`)    | composition root (3 アプリと並ぶ)        | `client-domain`, `client-ports`, `embedded-backend`, `embedded-backend-adapter`, `node-sqlite-db-adapter` |

- `client` の meta barrel には依存しない (client-ui 経由で React を引き込むため)
- `OpenkkServerPort` を直接呼ばない。帳票・CSV・zip・締め仕訳は client 側の型で書かれていて、直接呼ぶと client と server の型が混ざる (設計原則 1)。`OpenkkBackendPort` 経由なら、HTTP のバックエンドにも差し替えられる

### 切り出しが要るもの

帳票 HTML (`client-domain/src/print/*`)・CSV / JSON・zip は client-domain の純粋関数なので、Node でもそのまま使える。React の hook の中にある組み立てだけ、client-domain へ移す。

- `client-ui/src/steps/use-step-documents.ts` の締め仕訳と帳票 3 点の生成 → `buildFiscalPeriodDocuments()` など
- `client-ui/src/steps/bodies/closing.tsx` の本締め用の仕訳準備 (`prepareAssistEntriesForFinalClosing`)
- `client-usecases/src/shared/fiscal-period-archive-export.ts` の payload 組み立て

本締めはクライアントが作った仕訳をサーバーが照合する設計なので、この切り出しが済むまで CLI から本締めはできない。

## ベータのコマンド

共通: `--file <path>` (または `OPENKK_FILE`)、`--user` (既定 `openkk-original-user`)

```
openkk init
openkk periods list | show | create --name --start --end
openkk entries list [--json|--csv] | add | import <file> | export
openkk report journal|ledger|fs --out <file.html>
openkk archive export <period> <out.zip> | import <zip>
openkk preclose [--cancel]
openkk close            # 切り出しの後
```

## 進め方

1. `node-sqlite-db-adapter` を作り、`runDbPortConformance` を一時ファイルと `:memory:` の両方で通す。開き直しても残ること、新しすぎるスキーマを拒否することもテストする
2. `cli` の土台 (`node:util` の `parseArgs`、`init`・`periods`)
3. `entries` (client-domain の CSV / JSON 関数を使い、往復テストを付ける)
4. 帳票の組み立てを client-domain へ切り出し、client-ui をそれに置き換えて `report` を足す
5. `archive export / import` (ブラウザで作った zip を取り込めることをテストする)
6. `preclose` / `close`
7. (後) ブラウザ版に DB ファイルの書き出し・読み込みを付ける

パッケージを足すときは、ルートの workspaces、`test/package-structure.test.ts` の `allowedLayers`、`npm run gen-deps` (`docs/dependency-graph.md`)、`docs/architecture.md` の port 表も更新する。
