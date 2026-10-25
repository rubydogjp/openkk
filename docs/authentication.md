# 認証 (Authentication)

オープン会計はユーザーをドメインの第一級概念として扱う。種類は2つ。

| 種別           | 用途                                        | サインイン     | サインアウト               |
| -------------- | ------------------------------------------- | -------------- | -------------------------- |
| `EmbeddedUser` | この端末固定の1名（sim/demo/original）      | 起動時に自動   | 不可（常にサインイン状態） |
| `CustomUser`   | OSS 派生プロダクトの実ユーザー（Google 等） | 認証フロー経由 | 可                         |

```ts
type OpenkkUser = EmbeddedUser | CustomUser;
type EmbeddedUser = { kind: "embedded"; id: string; displayName: string };
type CustomUser = {
  kind: "custom";
  id: string;
  displayName: string;
  email: string | null;
  iconUrl: string | null;
  authProvider: string;
};
```

ヘルパ: `userCanSignOut` / `userEmail`（`@rubydogjp/openkk-client-domain`）。

## モード選択

`OpenkkConfig.authMode` で切り替える。

- `"embedded"`（既定）: `config.embeddedUser` で自動サインイン。サインアウト UI は非活性。
- `"custom"`: 前回サインインした `CustomUser` を復元し、なければサインアウト状態で起動する。

リファレンスアプリ（sim/demo/original の3バンドル）はすべて `authMode: "embedded"`。

## CustomUser 認証の実装（サードパーティ向け）

外部認証（OAuth、トークン検証、セッション管理）はサードパーティが実装する。openkk は `AuthApi` とユーザー型を提供する。

1. **`authMode: "custom"`** を `OpenkkConfig` に設定する。
2. **`OpenkkBackendPort.auth` を実装したクライアントアダプタ** を用意し、独自バックエンドへ接続する。TypeScriptサーバーでは `OpenkkServerPort.auth` が同じ契約を持つ。実装するメソッド:
   - `startSession(redirectUrl)` → 外部認証 URL を発行（`{ authUrl }`）。
   - `completeSession(state, code)` → 認証完了し `{ completionCode }` を返す。
   - `redeemCompletionCode(completionCode)` → `RedeemCompletionCodeResponse` を返す。未設定の `displayName` / `email` / `iconUrl` / `authProvider` は `null` にする。
   - `signOut()` → サーバ側セッション/Cookie を破棄。
3. クライアントの状態管理（`openkk-app-state`）が以下を自動で駆動する。実装不要。
   - サインイン: `startSignIn` → 外部 URL へリダイレクト → `/auth/result` で `completeSignIn`（= `completeSession` ＋ `redeemCompletionCode`）→ `CustomUser` を保持。`/auth/result` には `AuthResultPage` を置く。
   - サインアウト: `auth.signOut()` を呼び、ローカルのユーザーを破棄。
   - 戻り先: `startSignIn(redirectUrl, returnPath)` の `returnPath` に渡したパスへ、`/auth/result` がサインインの完了後に移動する（`null` なら `/fiscal-periods`）。戻り先は同じサイト内のパスだけを受け付け、15分で失効し、一度使うと消える。独自の完了画面では `takeSignInReturnPath()` で受け取る。

所有者検証は `server-usecases` が担当する。`server-api` は期間と子リソースの所属関係・操作可能なフェーズ・入力形式も検証する（[`architecture.md`](./architecture.md) 参照）。

## マイページ

`OpenkkConfig.myPagePath` にアプリ内のパスを設定すると、アカウントメニューに「マイページ」が現れ、そのパスへ遷移する。`null` なら項目を出さない。
ページ本体（プロフィール、外部連携の管理など）は派生プロダクトが実装する。

## 復元とトークン有効性（CustomUser）

クライアントは起動時に前回の `CustomUser` を `PlatformPort` の `storage` から復元し、有効かは確かめない。バックエンドは保存ユーザーを信頼せず、自前のトークン/Cookie で認可する。

- アダプタはトークンの更新などで回復できなかったときだけ、`statusCode: 401` のエラーを投げる。
- `auth` 以外の呼び出しが 401 になると、手元の `CustomUser` を消してサインアウトの状態に戻す。`useBackendApi()` で受け取った backend の呼び出しも含む。
- それ以外の失敗では、シェル上部に再読み込み用のエラーバナーを表示する。
