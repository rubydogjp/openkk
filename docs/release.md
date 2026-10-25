# リリース手順

`packages/` 配下のライブラリを npm に publish する。
`@rubydogjp/openkk` / `openkk-sim` / `openkk-demo` はアプリなので `private: true` で、publish されない。

publish の認証は Trusted Publishing (OIDC) で行い、npm のトークンは使わない。

## バージョン

全 workspace が同じバージョンを持ち、リリースタグ `vX.Y.Z` と一致させる。
ずれていると `Release` workflow が publish の前に止まる。

## 手順

1. develop の変更を main へ squash で取り込む。
2. main で `npm run version:set X.Y.Z` を実行し、`release: X.Y.Z` としてコミットして push する。
   内部依存 (`@rubydogjp/openkk-*`) の範囲と `package-lock.json` も一緒に更新される。
3. main にタグ `vX.Y.Z` を打って push する。`Release` workflow が検証とテストのあとに publish する。
4. develop は main から作り直す。develop に main をマージしない。

npm に同じバージョンがあるパッケージは飛ばすので、途中で失敗しても workflow を再実行できる。
publish せずに配布物だけ確かめたいときは、`Release` workflow を手動で実行する（既定で dry run）。

## Trusted Publishing の設定

パッケージごとに、publish を許す repository と workflow を npm に登録する。

```
npm login
npm run setup-trusted-publishing
```

`npm trust` にはアカウントの 2FA が要る。設定済みのパッケージは飛ばすので、何度実行してもよい。

Trusted Publishing は npm にすでにあるパッケージにしか設定できない。
新しいパッケージは初回だけ手元から publish してから設定する。

```
npm publish --workspace <package> --access public
npm run setup-trusted-publishing
```

## 配布物

- 公開するのは `dist` だけ (`files: ["dist"]`)。`dist` は git 管理外で、`npm ci` のときに作られる。
- 各パッケージの `LICENSE` が root の `LICENSE` と同じであることを、公開前の検証で確かめる。
- 全ライブラリの公開エントリを Node から import できることをテストで確かめる。
