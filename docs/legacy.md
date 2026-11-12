# レガシー

前の版のデータやファイルを読むためだけに残しているコードの一覧。新しい機能では使わない。

レガシーなコードは、名前と置き場で見分ける (コードにコメントは書かない)。

- 箱ごとレガシーなら、箱の名前を `legacy-` で始める。
- 箱の中にあるなら、`legacy/` というフォルダに置き、ファイルの名前を `legacy-` で始める。
- 関数・型・設定の名前に `Legacy` を入れる。

`legacy-` で始まるファイルが `legacy/` フォルダか `legacy-*` の箱の外にあると、構造のテスト (`test/package-structure.test.ts`) が落ちる。

## 一覧

| 残しているもの                                | 置き場                                                                                                                                                                                                 | なぜ残すか                                                                                       | いつ切れるか                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 26.3 までの無印版の DB を読む                 | 箱 `legacy-db-adapter` (`createLegacyDbAdapter`・`exportLegacyDbBytes`)                                                                                                                                | 26.3 までの無印版は、全期間を OPFS の 1 つの DB に置いていた。新しい版が起動するときに読み出す   | 26.3 以前から上げていない利用者を見切ると決めたとき                                              |
| 前の版の帳簿を、期間ごとの帳簿へ移す          | `bundle-original/app/legacy/legacy-book.ts`                                                                                                                                                            | 上の DB を、期間ごとの帳簿 (`.openkk`) に分けてブラウザの中に置き直す                            | 上と同じ                                                                                         |
| 圧縮済みファイル (zip) を読む                 | `driver/src/domain/legacy/legacy-archive-zip.ts` (`readLegacyArchiveZip`・`looksLikeLegacyArchiveZip`)、`frontend-ui/src/legacy/legacy-archive-import.ts`、`frontend-cli/src/legacy/legacy-archive.ts` | 以前の「圧縮保存」で利用者が手元に持っている zip を、新しい期間として取り込めるようにする        | 利用者の手元の zip を取り込めなくしてよいと決めたとき                                            |
| 圧縮済みファイルを取り込むかどうかの設定      | `OpenkkConfig.fiscalPeriodPolicy.allowLegacyArchiveImport`                                                                                                                                             | zip の取り込みを出さない製品のため                                                               | zip を読む道を切るとき                                                                           |
| 版 1 の圧縮済みファイルを今の形に直す         | `engine/src/usecases/legacy/legacy-archive-import-v1.ts` (`migrateLegacyArchiveV1`)                                                                                                                    | 版 1 の zip (固定資産が別の形) も取り込めるようにする                                            | zip を読む道を切るとき                                                                           |
| 期間の状態 `archived`・`purged`               | 契約の `archiveStatus`・`archivedAt`、`fiscalPeriods.archive`・`fiscalPeriods.purgeArchivedData` (`driver/src/ports/backend/types.ts`・`backend-api/src/contract.ts`・`engine`・`sqlite-db-adapter`)   | 以前に圧縮保存した期間のデータが残っている。画面はもう `archive`・`purgeArchivedData` を呼ばない | どの保存先にも `archived`・`purged` の期間がなくなり、クラウドに置く版のサーバーからも外したとき |
| データを削除済み (`purged`) の期間の知らせ    | `frontend-ui/src/legacy/legacy-purged-fiscal-period-screen.tsx`                                                                                                                                        | 以前にデータを削除した期間を選んだときに、保存してあるファイルを取り込むよう案内する             | `purged` の期間がなくなったとき                                                                  |
| 以前の形式の仕訳の CSV (localId の列) と JSON | `driver/src/domain/legacy/legacy-journal-files.ts` (`importEntriesFromLegacyCsv`・`importEntriesFromLegacyJson`・`exportEntriesAsLegacyJson`)                                                          | 以前に書き出した CSV・JSON を取り込めるようにする。JSON の書き出しは、非推奨として残している     | 以前の形式のファイルを取り込めなくしてよいと決めたとき                                           |

## レガシーではないもの

名前に archive が付くが、今も使っているもの。

- 圧縮保存と同じ形の受け渡し (`FiscalPeriodArchivePayload`・`fiscalPeriods.importArchived`・`fiscalPeriods.applyCarryoverFromArchive`): 会計期間をまるごと別の保存先へ渡すときの形。帳簿をまたいだ引き継ぎ、openkk-cli の `periods export`・`opening carry`、帳簿でない製品への `.openkk` の取り込みが使う。zip には包まず、値のまま渡す。
