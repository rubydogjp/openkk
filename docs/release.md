# リリース手順

`packages/` 配下のライブラリ 16 個を npm に publish する。
`@rubydogjp/openkk` / `openkk-sim` / `openkk-demo` はアプリなので `private: true`、publish されない。

publish の認証は Trusted Publishing (OIDC) で行う。npm のトークンは使わないので、
GitHub Secrets に登録するものは無い。

## バージョンの決まり

全 workspace が同じバージョンを持ち、リリースタグ `vX.Y.Z` と一致させる。
タグとパッケージのバージョンがずれていると workflow が publish 前に止まる。

## 手順

1. バージョンを上げる。内部依存 (`@rubydogjp/openkk-*`) の範囲と
   `package-lock.json` も一緒に更新される。

   ```
   npm run version:set 26.1.9
   ```

2. 差分を確認してコミットする。

   ```
   git commit -am "bump version to 26.1.9"
   ```

3. タグを打って push する。

   ```
   git tag v26.1.9
   git push origin main v26.1.9
   ```

4. `Release` workflow がタグ一致の検証 → build → lint → test → `npm publish` を実行する。
   provenance は OIDC 経由の publish で自動的に付く。

内容だけ先に確認したい場合は `Release` workflow を手動実行する。
`dry_run` が既定で有効なので、publish せずに配布物を確認できる。

## Trusted Publishing の設定

パッケージごとに「どのリポジトリのどの workflow からの publish を信頼するか」を
npm 側に登録する。`npm trust` は workspace を解釈しないので、スクリプトで回す。

```
npm login
npm run setup-trusted-publishing
```

`npm trust` には npm 11.15.0 以上と、アカウントレベルの 2FA が必要。
2FA バイパスのトークンでは実行できない。

設定内容は `npm trust list <package>` で確認できる。

## 新しいパッケージを追加したとき

Trusted Publishing は**既に npm 上に存在するパッケージにしか設定できない**。
新しく公開するパッケージは、初回だけ手元から publish して登録する。

```
npm login
npm publish --workspace <package> --access public
npm run setup-trusted-publishing
```

以降はタグを打てば CI から publish される。

## 配布物について

- `files: ["dist"]` なので `dist` だけが含まれる。`dist` は git 管理外で、
  `npm ci` 時に root の `prepare` (`build:packages`) が生成する。
- 出力は拡張子なしの import を含むため、解決はバンドラに依存する。
  Next.js からの利用は確認済みだが、Node から直接 import することはできない。
