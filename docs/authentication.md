# 認証 (Authentication)

オープン会計はユーザーをドメインの第一級概念として扱う。種類は2つ。

| 種別 | 用途 | サインイン | サインアウト |
|---|---|---|---|
| `EmbeddedUser` | この端末固定の1名（dev/demo/prod） | 起動時に自動 | 不可（常にサインイン状態） |
| `CustomUser` | OSS 派生プロダクトの実ユーザー（Google 等） | 認証フロー経由 | 可 |

```ts
type OpenkkUser = EmbeddedUser | CustomUser;
type EmbeddedUser = { kind: "embedded"; id: string; displayName: string };
type CustomUser = {
  kind: "custom";
  id: string;
  displayName: string;
  email: string;
  iconUrl: string | null;
  authProvider: string;
};
```

ヘルパ: `isEmbeddedUser` / `isCustomUser` / `userCanSignOut` / `userEmail`（`@rubydogjp/openkk-client-domain`）。

## モード選択

`OpenkkConfig.authMode` で切り替える。

- `"embedded"`（既定）: `config.embeddedUser` で自動サインイン。サインアウト UI は非活性。
- `"custom"`: 起動時はサインアウト状態（前回サインインした `CustomUser` を localStorage から復元）。

リファレンスアプリ（dev/demo/prod）はすべて `authMode: "embedded"`。

## CustomUser 認証の実装（サードパーティ向け）

認証の実体（OAuth、トークン検証、セッション管理）はサードパーティが実装する。openkk 側は seam（`OpenkkServerPort.auth` = `AuthApi`）とドメイン型のみ提供する。最小実装手順は次の通り。

1. **`authMode: "custom"`** を `OpenkkConfig` に設定する。
2. **`OpenkkServerPort.auth` を実装したバックエンド adapter** を用意する（`embedded-backend` の代わりに HTTP backend を `createOpenkkEmbeddedBackendAdapter` 相当で差し込む）。実装するメソッド:
   - `startSession(redirectUrl)` → 外部認証 URL を発行（`{ authUrl }`）。
   - `completeSession({ state, code })` → 認証完了し `{ completionCode }` を返す。
   - `redeemCompletionCode(completionCode)` → `CreateTokenResponse` を返す。`userId` は必須、`displayName` / `email` / `iconUrl` / `authProvider` を返すとそのまま `CustomUser` に反映される。
   - `signOut()` → サーバ側セッション/Cookie を破棄。
3. クライアントの状態管理（`openkk-app-state`）が以下を自動で駆動する。実装不要。
   - サインイン: `startSignIn` → 外部 URL へリダイレクト → `/auth/result` で `completeSignIn`（= `completeSession` ＋ `redeemCompletionCode`）→ `CustomUser` を保持。
   - サインアウト: `auth.signOut()` を呼び、ローカルのユーザーを破棄。

> 所有者検証は `server-api` の `getOwnedFiscalPeriod` に集約されている（[`architecture.md`](./architecture.md) 参照）。`server-usecases` を直接組む場合は呼び出し側で同等の検証を実装すること。
