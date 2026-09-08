# API Contract

## Packages

| Boundary | Package | Types |
|---|---|---|
| Client backend | `@rubydogjp/openkk-client-ports` | `OpenkkBackendPort`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto` |
| TypeScript server | `@rubydogjp/openkk-server-ports` | `OpenkkServerPort`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto` |
| Server storage | `@rubydogjp/openkk-server-ports` | `OpenkkDbPort`, `*DbRecord`, `*DbInput` |
| Errors | `@rubydogjp/openkk-*-domain` | `AppError`, `AppErrorLike` |

`client-*` and `server-*` keep separate type definitions on purpose.
制限値も両側に持ち、名前を揃える。値の一致は `test/shared-limits.test.ts` が固定する。

## テキスト項目の上限

自由入力は `MAX_TEXT_FIELD_LENGTH`（400文字）まで。`assertNonBlankString` /
`assertString` を通る全項目が対象。緩めるのは容易、厳しくするのは難しいため厳しめに取る。

強制するのは入力境界（server-api とアーカイブ取込）だけ。永続化境界の検証は
読み取りでも通るため、そこに置くと上限超えの既存データが読めなくなる。

## 値の省略

省略可能プロパティ (`foo?: T`) を作らず `foo: T | null` とし、呼び出し側が `null` を
明示的に渡す。「ある / null / 未指定」の3状態は判定の分岐を増やす。
配列は `T[]` を必須にする（「未指定」と「空」を区別しない）。

例外は3つ。許可リストの正本は `test/explicit-null.test.ts`。

| 例外 | 理由 |
|---|---|
| 外部 API の呼び出し形を写した型 | 先方の契約が `undefined`（sqlite-wasm `exec`、worker message、React DOM props） |
| 既定値つきの表示用 prop | `disabled = false` は内部で値が確定し分岐が増えない |
| テストの上書きファクトリ | `Partial<T>` の「未指定 = 既定値」 |

PATCH 入力の `Partial<>` は例外ではなく仕様。「未指定 = 変更しない」は `T | null` で表せない。

## Naming

| Suffix | Meaning |
|---|---|
| `*Request` | REST request payload |
| `*Response` | REST response body |
| `*ApiRecord` | API result record |
| `*Input` | operation input |
| `*DbRecord` | storage record |
| `*DbInput` | storage input |
| `OpenkkApiErrorDto` | error JSON |

Do not use `RequestDto` or `ResponseDto`.

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
};
```

Typical status codes: `400`, `404`, `409`, or `null`.
For HTTP errors, the HTTP status overrides `OpenkkApiErrorDto.statusCode`.
Missing or malformed error bodies become a safe client-side `OpenkkApiErrorDto`.

## Backend Port

Implement `OpenkkBackendPort` to replace the backend.
The TypeScript server exposes the same shape as `OpenkkServerPort`.

```ts
type OpenkkBackendPort = {
  auth: AuthApi;
  preClosing: PreClosingApi;
  closing: ClosingApi;
  entries: EntriesApi;
  fiscalPeriod: FiscalPeriodApi;
  fixedAssets: FixedAssetsApi;
  masterData: MasterDataApi;
};
```

Archived fiscal periods are read-only. Mutations against them must fail with `OpenkkApiErrorDto` and `statusCode: 409`.

## Value Rules

| Value | Rule |
|---|---|
| date | `YYYY-MM-DD` |
| `businessRate` | `0..1` |
| amount | non-negative number |
| `usefulLife`, closing `year` | positive integer |

`fiscalPeriod.archive` preserves `phase`, sets `archiveStatus` to `archived`, and stamps `archivedAt`.

`FiscalPeriodArchiveImportInput` creates a new active period in the archived `phase`.

## Fiscal Period Lifecycle Policy

Third-party backends declare a lifecycle policy via `OpenkkConfig.fiscalPeriodPolicy`
(resolve it with `resolveFiscalPeriodPolicy`). Defaults preserve plain-OpenKK behaviour.

| Field | Default | Meaning |
|---|---|---|
| `maxActivePeriods` | `null` | Max non-archived periods. `null` = unlimited. `1` blocks creating a next period until the current one is archived. |
| `archiveRetention` | `"persistent"` | `"persistent"` keeps archived data forever. `"ephemeral"` purges archived data when advancing to the next period (stub remains). |
| `ephemeralArchiveWarning` | — | Optional per-bundle override for the irreversible-advance warning text. |

`FiscalPeriodApiRecord` carries two lifecycle fields (both optional on the wire, default
`archiveDataAvailable: true` / `archivedAt: null`):

- `archiveDataAvailable` — `false` marks a purged stub: real data is gone, download/view is unavailable.
- `archivedAt` — ISO timestamp for listing and ordering archived periods.

`fiscalPeriod.purgeArchivedData(id)` deletes an archived period's real data
(entries/lines/opening/fixed assets/closings) and returns the lightweight stub
(`archiveDataAvailable: false`). It requires the period to be `archived` (otherwise `409`).
`persistent` backends may leave it unimplemented / no-op. Carryover into the next period
must be committed **before** purge so the new period never depends on purged data.

## Archive Zip Format (stable public contract)

The `openkk.fiscal-period-archive` zip (current `version: 1`) is a **stable, versioned
public contract** so archives exported by any backend (e.g. a cloud host) re-import into
plain OpenKK / the PWA. A zip contains `manifest.json`, `fiscal-period.json`,
`entries.json`, `fixed-assets.json`, `closings.json` (stored, UTF-8, CRC32-checked).
Build/read it via `createFiscalPeriodArchiveZip` / `readFiscalPeriodArchiveZip`.
Breaking changes must bump `FISCAL_PERIOD_ARCHIVE_VERSION`; readers stay backward-compatible.
