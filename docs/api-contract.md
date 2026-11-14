# API Contract

## Packages

| Boundary         | Package                         | Types                                                                                     |
| ---------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 使う側の口       | `@rubydogjp/openkk-driver`      | `OpenkkBackendPort`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto` |
| 受ける側の入口   | `@rubydogjp/openkk-backend-api` | `OpenkkBackendApi`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto`  |
| 受ける側の保存先 | `@rubydogjp/openkk-engine`      | `OpenkkDbPort`, `*DbRecord`, `*Db*Input`                                                  |
| Errors           | `driver`・`engine` の domain    | `AppError`, `AppErrorLike`                                                                |

使う側 (`driver`) と受ける側 (`backend-api`) は、契約を独立に定義する。食い違いは `test/package-structure.test.ts` が見つける。

振る舞いの契約は `@rubydogjp/openkk-driver/backend-contract` の `BACKEND_CONTRACT_CASES` にある。口 backend (`OpenkkBackendPort`) の実装は、これに通す。

## テキスト項目の上限

名称、摘要、取引先、独自カテゴリなどの自由入力は400文字まで。ID、日付、認証値は対象外。
保存済みの文字列は、復元・本締め・翌期繰越・変更しない項目の再保存では入力上限にかかわらず保持する。

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

Typical status codes: `400`, `404`, `409`, or `null`.
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

`FiscalPeriodArchiveImportInput` creates a new active period in the archived `phase`.

`fiscalPeriods.createNext` creates the next period atomically from a closed period with completed document receipt. It carries balances, selected reversals and active fixed assets from stored data. The source may already be archived but not purged, and the next start date must follow the source end date.

## Fiscal Period Policy

`OpenkkConfig.fiscalPeriodPolicy` holds one switch.

| Field                      | Default | Meaning                                                                    |
| -------------------------- | ------- | -------------------------------------------------------------------------- |
| `allowLegacyArchiveImport` | `true`  | Allow importing an archive zip made by an earlier version (legacy import). |

`opening` is always present: a period without opening balances carries an empty one.

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
