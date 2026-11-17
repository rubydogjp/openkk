# API Contract

## Packages

| Boundary         | Package                         | Types                                                                                     |
| ---------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 使う側の口       | `@rubydogjp/openkk-driver`      | `OpenkkBackendPort`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto` |
| 受ける側の入口   | `@rubydogjp/openkk-backend-api` | `OpenkkBackendApi`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto`  |
| 受ける側の保存先 | `@rubydogjp/openkk-engine`      | `OpenkkDbPort`, `*DbRecord`, `*Db*Input`                                                  |
| Errors           | `driver`・`engine` の domain    | `AppError`, `AppErrorLike`                                                                |

使う側 (`driver`) と受ける側 (`backend-api`) は、契約を独立に定義する。`test/package-structure.test.ts` が見つけるのは、境界の型 (名前が `Request`・`Response`・`ApiRecord`・`Input`・`ApiErrorDto` で終わるものと決めた interface) の名前と本文、エンドポイントの食い違いまで。選べる値の型 (`FiscalPeriodApiPhase` など) は比べないので、両側を手で合わせる。

振る舞いの契約は `@rubydogjp/openkk-driver/backend-contract` の `BACKEND_CONTRACT_CASES` にある。口 backend (`OpenkkBackendPort`) の実装は、これに通す。

## テキスト項目の上限

名称、摘要、取引先、独自カテゴリなどの自由入力は400文字まで。ID、日付、認証値は対象外。
保存済みの文字列は、復元・本締め・翌期繰越・変更しない項目の再保存では入力上限にかかわらず保持する。

## 使えない文字

外から入る全部の入口 (`backend-api` の会計期間・仕訳・固定資産・仮締め・本締めの呼び出し。圧縮済みファイルの取り込み `importArchived` と、別の帳簿からの引き継ぎ `applyCarryoverFromArchive` を含む) で、引数のどこかの文字列 (キーも) に U+0000 があれば 400 (「使えない文字が含まれています」) で断る。ブラウザの SQLite Wasm は U+0000 を含む文字列を読むときにそこで切り詰めるので、1 件の仕訳で期間全体が読めなくなるのを防ぐため。保存済みのデータを読むときの決まりには入れない。

## 仕訳の取引先と区分

仕訳の作成 (`entries.create`)・変更 (`entries.update`)・まとめての取り込み (`entries.importMany`) では、1 つの仕訳の明細の行 (`lines[]`) の `partnerName`・`taxCategoryId`・`businessCategoryId` を、どの行も同じ値にする。違う行があれば 400 で断る。
保存済みの仕訳は、行どうしの値が違っていても読み取り・本締め・翌期繰越・復元で断らない。

## 値の省略

内部データのプロパティは必須とし、値がない場合は `null`、配列には空配列を使う。
PATCH 入力だけは「未指定 = 変更しない」を表すため省略可能にする。

## Naming

| Suffix              | Meaning              |
| ------------------- | -------------------- |
| `*Request`          | REST request payload |
| `*Response`         | REST response body   |
| `*ApiRecord`        | API result record    |
| `*Input`            | operation input      |
| `*DbRecord`         | storage record       |
| `*Db*Input`         | storage input        |
| `OpenkkApiErrorDto` | error JSON           |

## HTTP Metadata

Use `OPENKK_HTTP_ENDPOINTS` for method, path, and success status.
Adapters own transport details. Backends own validation and `OpenkkApiErrorDto`.
Use `resolveOpenkkHttpResponse` to validate status and error bodies.
Use `openkkHttpTransportError` when no HTTP response was received.

## Error JSON

```ts
type OpenkkApiErrorDto = {
  messageForDeveloper: string;
  messageForUser: string;
  originalMessage: string | null;
  statusCode: number | null;
  code: string | null;
};
```

Typical status codes: `400`, `401`, `404`, `409`, or `null`.
`401` means the sign-in has expired: when any call other than `auth` fails with `401`, the client ends the session and shows the sign-in again (`wrapWithSessionExpiry`). Use it only for that, not for "not allowed" (use `404` or `409`).
Maintenance mode uses `code: MAINTENANCE_MODE_ERROR_CODE`; `isMaintenanceModeError` reads that `code`.
For HTTP errors, the HTTP status overrides `OpenkkApiErrorDto.statusCode`.
Missing or malformed error bodies become a safe client-side `OpenkkApiErrorDto`.

## Backend Port

Implement `OpenkkBackendPort` to replace the backend.

```ts
type OpenkkBackendPort = {
  auth: AuthApi;
  preClosings: PreClosingsApi;
  closings: ClosingsApi;
  entries: EntriesApi;
  fiscalPeriods: FiscalPeriodsApi;
  fixedAssets: FixedAssetsApi;
  masterData: MasterDataApi;
  maintenance: MaintenanceApi;
};
```

`OpenkkBackendApi` is the same shape without `maintenance`.

## Value Rules

| Value                       | Rule                                                   |
| --------------------------- | ------------------------------------------------------ |
| date                        | `YYYY-MM-DD`                                           |
| `businessRate`              | `0..1`                                                 |
| amount                      | non-negative safe integer                              |
| `usefulLife`                | integer, `1..100`                                      |
| fixed-asset disposal fields | sold: date and price; disposed: date; otherwise `null` |

`fiscalPeriods.start` moves a `pre_opening` period to `journalizing`.

`FiscalPeriodArchiveImportInput` creates a new active period with a new ID, in the `phase` the archive records (for example `post_closing`). It is used both for an archive zip from an earlier version and for a `.openkk` book file imported into a backend that does not keep book files (Sim, demo and the cloud version).

`fiscalPeriods.createNext` creates the next period atomically from a closed period with completed document receipt. It carries balances, selected reversals and active fixed assets from stored data. The source may already be archived but not purged, and the next start date must follow the source end date.

`fiscalPeriods.applyCarryover` and `fiscalPeriods.applyCarryoverFromArchive` overwrite the chosen items of a period that already exists. See "26.3.1 からの変更".

## Fiscal Period Policy

`OpenkkConfig.fiscalPeriodPolicy` holds one switch.

| Field                      | Default | Meaning                                                                    |
| -------------------------- | ------- | -------------------------------------------------------------------------- |
| `allowLegacyArchiveImport` | `true`  | Allow importing an archive zip made by an earlier version (legacy import). |

`opening` is always present: a period without opening balances carries an empty one.

## 26.3.1 からの変更

26.3.1 の契約で動くバックエンド (クラウド版の Go のサーバーなど) が、この版の使う側とつなぐために合わせること。

### 足した口

| 口                                        | HTTP                                                     | 入力                                         |
| ----------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `fiscalPeriods.applyCarryover`            | `POST /fiscal-periods/{id}/apply-carryover`              | `FiscalPeriodCarryoverApplyInput`            |
| `fiscalPeriods.applyCarryoverFromArchive` | `POST /fiscal-periods/{id}/apply-carryover-from-archive` | `FiscalPeriodCarryoverFromArchiveApplyInput` |
| `masterData.getMasterSets`                | `GET /master/sets`                                       | なし                                         |

どちらも成功すると `200` で `{ fiscalPeriod }` を返す。決まり:

- 引き継ぎ先 (`{id}`) は `active` で、`pre_opening` か `journalizing` の期間だけ。それ以外は `409`
- 引き継ぎ元は本締め (`post_closing`) と書類の受領 (`documentsReceivedCompleted`) を終えていて、`purged` でなく、引き継ぎ先の開始日が引き継ぎ元の終了日の翌日であること (すぐ前の期間からだけ引き継げる。26.3.1 は「終了日より後」なら間が空いていても通した。`createNext` も同じ)。違えば `409` (日付は `400`)。`applyCarryover` の元は同じ利用者の期間 (`sourceFiscalPeriodId`)、`applyCarryoverFromArchive` の元は入力の `archive` (別の帳簿ファイルから読んだ期間) で、`archive` は `importArchived` と同じ決まりで確かめる
- `carryBalances: true` なら期首の残高を元の期末の残高で置き換え、`openingBalancesCompleted` を `true` にする。`false` なら今の期首の残高をそのまま残す
- `carryFixedAssets: true` なら、引き継ぎ先の固定資産のうち取得日が引き継ぎ先の開始日より前のものを消してから、元の固定資産のうち引き継げるものを入れる。取得日が引き継ぎ先の期間の中にあるもの (その期間に買って登録したもの) は残す (`keepsFixedAssetOnCarryover`)。`false` なら触らない
- 再振替に使う勘定科目は、未収入金・未収収益・前払金・前払費用・貯蔵品・未払金・未払費用・前受金・前受収益だけ。26.3.1 にあった在庫の科目 (棚卸資産・商品・製品・原材料・仕掛品) は外した (期末のしーくりくりしーと二重になるため)
- 再振替: `reversalEntryIds` (`applyCarryover`) と `reversalEntryIndexes` (`applyCarryoverFromArchive`) は、`null` と `[]` で意味が違う。`null` は「今の期首の再振替仕訳を残す」、`[]` は「再振替仕訳を消す」、要素があれば「その仕訳から作り直す」。`null` を `[]` と同じに扱うと、利用者が入れた再振替仕訳を消してしまう。`reversalEntryIndexes` は `archive.entries` の中の位置 (0 から)。`reversalEntryIds` は元の期間の仕訳の ID
- 1 つのトランザクションで行い、途中で失敗したら何も変えない
- `fiscalPeriods.createNext` の `reversalEntryIds` は、今までどおり配列だけ (`null` は来ない)

### 科目と区分の版 (`masterSetId`)

- `GET /master/sets` は `200` で `{ masterSets: MasterSetApiRecord[] }` を返す。`MasterSetApiRecord` は `{ id, name, effectiveFrom, bookAccounts, taxCategories, businessCategories }` で、中身の形は今の 3 つの口 (`/master/book-accounts` など) と同じ。古いものから順に並べ、`effectiveFrom` (`YYYY-MM-DD`) は後の版ほど大きい。最初の版は `jp-2026` (版を持たない期間をこの版と読むため、必ず返す)。今の 3 つの口は最新の版の中身を返すまま残す。使う側は `/master/sets` が `404` のときだけ 3 つの口から `jp-2026` の 1 版を作るので、サーバーの更新が後になっても動くが、版ごとの一覧は使えない
- `FiscalPeriodApiRecord` に `masterSetId: string` を足した。使う側は、来なければ `jp-2026` と読む
- `create`・`createNext` で作る期間の `masterSetId` は、サーバーが開始日で決める (`effectiveFrom` が開始日以前の版のうち最新。`masterSetForStartDate`)。入力には来ない。開始日を変えても版は変えない
- `importArchived`・`applyCarryoverFromArchive` の `archive.fiscalPeriod.masterSetId` は、あればそのまま保ち (サーバーの知らない版でも)、なければ `jp-2026` にする。空や前後に空白のある文字列は `400`
- `PATCH /fiscal-periods/{id}` の入力に `masterSetId` を足した (`FiscalPeriodPatchInput`)。`pre_opening` と `journalizing` の期間だけ変えられ、`pre_closing` は今までどおり `409`、`post_closing` も `409` (書類の受領以外は変えられない)。サーバーの知らない版 ID は `400`。切り替えても仕訳・固定資産・期首は書き換えない
- 仕訳・固定資産の `bookAccountId` は、サーバーの知っているどれかの版にある ID なら受け付ける (期間の版にあるかは問わない)

### なくした口と設定

- `POST /fiscal-periods/{id}/archive` と `POST /fiscal-periods/{id}/purge-archived-data` (圧縮保存と、圧縮保存したデータの削除) はもう呼ばない。サーバーに残しておいてもよいが、使う側からは来ない
- `OpenkkConfig.fiscalPeriodPolicy` の `maxActivePeriods`・`archiveRetention`・`ephemeralArchiveWarning` をなくした。残っているのは `allowLegacyArchiveImport` だけ。期間の数を上限で絞る使い方 (「圧縮保存するまで次の期間を作れない」) はできなくなったので、それに頼っていたバックエンドは上限を外すこと。外さないと、利用者は次の期間へ進めない

### 読み方を変えたもの

- `archiveStatus: "archived"` の期間は、ふつうの (`active`) 期間として扱う。使う側は HTTP のバックエンドから来た `archived` を `active` と読む。バックエンドも、日付の重なり・変更・引き継ぎ元で `active` と同じ決まりを当てる (上の「Archived periods (legacy)」)
- `importArchived` は、以前の版の zip だけでなく、`.openkk` の帳簿ファイルの取り込みにも使う (Sim版・デモ版・クラウド版)。届く `archive.fiscalPeriod.archiveStatus` は `"archived"` だが、作る期間は `active` にする

### 入口で断るようにしたもの

- 仕訳の取引先・税区分・事業区分は 1 つの仕訳で 1 つ。行どうしで違えば `400` (上の「仕訳の取引先と区分」)
- 文字列に U+0000 があれば `400` (上の「使えない文字」)
- 自由入力は 400 文字まで (上の「テキスト項目の上限」)。保存済みのデータの読み込みには当てない
- `401` は「サインインが切れた」だけに使う (上の「Error JSON」)

### 契約テストで確かめていないこと

`BACKEND_CONTRACT_CASES` は `applyCarryover` の `reversalEntryIds` の `null` と `[]` の違いを試している。`applyCarryoverFromArchive` と、`purged` の期間への操作が `409` になることはまだ試していないので、サーバーの側で確かめること。

## Archived periods (legacy)

OpenKK no longer archives a period. A period is backed up as a `.openkk` book file instead, and a period stays readable after closing.
The contract has no archive or purge operation. Only the states that earlier versions wrote are still read.

- `archiveStatus` in a response is `active`, `archived`, or `purged`. `archivedAt` is `null` while `active`.
- An `archived` period keeps its data. OpenKK reads it as an ordinary (`active`) period: the embedded backend never returns `archived`, and the driver reads `archived` from an HTTP backend as `active`. A backend that still stores `archived` should apply the same rules as for `active` (date overlap, patches, carryover source).
- A `purged` period has no entries, fixed assets or opening. The screens show a notice, and its data comes back only by importing the file that was saved before the purge (as a new period). Mutations and child-data reads must fail with `OpenkkApiErrorDto` and `statusCode: 409`. A purged period does not count for date overlap and cannot be a carryover source.

## Archive Zip Format

The `openkk.fiscal-period-archive` zip (current `version: 2`) is a versioned public contract:
archives exported by any backend re-import into OpenKK. A zip contains `manifest.json`, `fiscal-period.json`,
`entries.json`, `fixed-assets.json`, `closings.json` (stored, UTF-8, CRC32-checked).
Build/read it via `createLegacyArchiveZip` / `readLegacyArchiveZip`.
Version 2 represents nullable fields as JSON `null`; imports also accept version 1.
`closings.json` lists the closing steps that `phase` has passed, each with the fiscal period end year.
Imports reject records that disagree with `phase`.
