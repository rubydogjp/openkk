# リリース手順

`packages/` 配下のライブラリ 16 個を npm に publish する。
`@rubydogjp/openkk` / `openkk-sim` / `openkk-demo` はアプリなので `private: true`、publish されない。

## バージョンの決まり

全 workspace が同じバージョンを持ち、リリースタグ `vX.Y.Z` と一致させる。
タグとパッケージのバージョンがずれていると workflow が publish 前に止まる。

## 手順

1. バージョンを上げる。内部依存 (`@rubydogjp/openkk-*`) の範囲と
   `package-lock.json` も一緒に更新される。

   ```
   npm run version:set 26.1.8
   ```

2. 差分を確認してコミットする。

   ```
   git commit -am "bump version to 26.1.8"
   ```

3. タグを打って push する。

   ```
   git tag v26.1.8
   git push origin main v26.1.8
   ```

4. `Release` workflow がタグ一致の検証 → build → lint → test → `npm publish` を実行する。

## 初回 publish の前に

- npm の `rubydogjp` organization に publish 権限があること。
- リポジトリの Secrets に `NPM_TOKEN` (Automation token) を登録すること。
- 内容だけ先に確認したい場合は、`Release` workflow を手動実行する。
  `dry_run` が既定で有効なので、publish せずに配布物を確認できる。

## 配布物について

- `files: ["dist"]` なので `dist` だけが含まれる。`dist` は git 管理外で、
  `npm ci` 時に root の `prepare` (`build:packages`) が生成する。
- 出力は拡張子なしの import を含むため、解決はバンドラに依存する。
  Next.js からの利用は確認済みだが、Node から直接 import することはできない。
