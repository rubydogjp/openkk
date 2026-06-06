# API Contract

## Packages

| Boundary | Package | Types |
|---|---|---|
| Client backend | `@rubydogjp/openkk-client-ports` | `OpenkkBackendPort`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto` |
| TypeScript server | `@rubydogjp/openkk-server-ports` | `OpenkkServerPort`, `*Request`, `*Response`, `*ApiRecord`, `*Input`, `OpenkkApiErrorDto` |
| Server storage | `@rubydogjp/openkk-server-ports` | `OpenkkDbPort`, `*DbRecord`, `*DbInput` |
| Errors | `@rubydogjp/openkk-*-domain` | `AppError`, `AppErrorLike` |

`client-*` and `server-*` keep separate type definitions on purpose.

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

`fiscalPeriod.archive` preserves `phase` and sets `archiveStatus` to `archived`.

`FiscalPeriodArchiveImportInput` creates a new active period in the archived `phase`.
