# オープン会計 — 機能カタログ

個人事業主向け複式簿記ライブラリ「オープン会計」が提供する機能の全体像。

---

## 1. 会計期間管理 (Fiscal Period Management)

| 機能 | 説明 |
|---|---|
| 期間の作成 | 任意の開始日・終了日で会計期間を作成 |
| 期間の選択 | 複数期間を持ちつつ対象期間を切り替え |
| 期間フェーズ | `pre_opening` → `journalizing` → `pre_closing` → `post_closing` |
| 圧縮保存 | フェーズを保持したまま `archiveStatus` を `archived` に変更し `archivedAt` を記録 |
| ロック判定 | `buildPeriodLockMessage` でステージ別の編集可否を判定 |
| ライフサイクルポリシー | `OpenkkConfig.fiscalPeriodPolicy` で `maxActivePeriods`（単一 active 強制）・`archiveRetention`（`persistent` / `ephemeral`）を宣言。既定値 `DEFAULT_FISCAL_PERIOD_POLICY` は無制限・恒久保持 |
| 実データ削除（purge） | `ephemeral` 構成で翌期へ進む確定後に `fiscalPeriods.purgeArchivedData` が実データを削除し、名称・期間・`archivedAt` だけを残して `archiveStatus` を `purged` にする |

---

## 2. 仕訳入力 (Journal Entry Management)

| 機能 | 説明 |
|---|---|
| 仕訳の作成 | 借方・貸方・金額・摘要・取引先・税区分・事業区分を入力 |
| 複合仕訳 | 1 仕訳に複数の借方/貸方明細行 (`lines[]`) を持てる |
| 月次ナビゲーション | 月単位でページネーションして表示 |
| 仕訳の編集 | 行クリックでドロワーを開き各フィールドを変更 |
| 仕訳の削除 | ドロワー内の削除ボタン → 確認ダイアログで実行 |
| 事業按分率 | 0–100%（小数可）で指定し、期末に個人負担分を振替 |
| 簡単入力ガイド | テンプレートから借方・貸方科目を自動補完するウィザード |

---

## 3. ファイルインポート / エクスポート (Data Portability)

| 機能 | 形式 | 説明 |
|---|---|---|
| インポート | JSON (`.json`) | `schema: "openkk-journal-v1"` 形式の仕訳 JSON を取り込む |
| インポート | CSV (`.csv`) | ヘッダ付き CSV を取り込む |
| エクスポート | JSON / CSV | 期間内全仕訳を明細ID・税区分・事業区分・厳密な事業割合を保ったままダウンロード |
| マージ | — | `localId` が既存仕訳と重複しないものだけ追加 |

---

## 4. 固定資産管理 (Fixed Asset Management)

| 機能 | 説明 |
|---|---|
| 固定資産の登録 | 名称・取得日・取得価額・耐用年数・事業按分率を入力 |
| 固定資産の編集 | 記帳中に各フィールドを更新 |
| ステータス管理 | `active` / `sold` (売却済) / `disposed` (廃棄済) / `retired` (完了)。完了年度の償却費は計上し、翌期へは繰り越さない |
| 減価償却バーチャル仕訳 | 当期償却費（期首〜期末／処分日の**月割**, 取得月算入の暦月ベース, 備忘価額1円で打ち切り）を自動生成 (`computePeriodDepreciation`) |
| 売却バーチャル行 | 売却済資産の処分日に「期首〜処分日の当期償却費」＋売却仕訳（処分日簿価で資産を除き、差額を固定資産売却損益）を自動生成 |
| 廃棄バーチャル行 | 廃棄済資産の処分日に「期首〜処分日の当期償却費」＋残存簿価を固定資産除却損として除却 |
| 家事按分 | 減価償却費・除却損は全額計上し、`businessRate` の個人負担分は本締め時の按分振替仕訳でまとめて事業主貸へ振替 |

---

## 5. 期首繰越 / 再振替 (Opening Carryover)

| 機能 | 説明 |
|---|---|
| 再振替仕訳の登録 | 翌期作成時に未払・前払などの候補から対象を選択。期首仕訳は後から編集可能 |
| バーチャル行として表示 | 1月の仕訳一覧に「再振替」バッジ付きで自動表示 |
| 期首残高の入力 | 資産・負債の期首残高 (`openingBalanceLines`) を貸借一致で入力 |

---

## 6. 締め処理フロー (Closing Flow)

ステップ UI が期間の状態に合わせて次のステップへ誘導する。`deriveSteps` は 6 ステップ構成で、仮締め (pre closing) は独立ステップではなく「日々の仕訳」ステップの完了操作として扱う。

| ステップ | 内容 |
|---|---|
| 1. 期間を開始 | 期間設定の確認 (開始日・終了日) |
| 2. 期首のBSを入力 | 貸借対照表の期首残高を入力 |
| 3. 日々の仕訳 | 仕訳の入力・インポート・進捗グラフの確認。完了時に `runPreClosing` で仮締めし仮の帳票3点を生成 |
| 4. 本締め | 最終帳票3点を生成・財務諸表サマリーを表示。本締め後は変更不可 |
| 5. 書類を受け取る | 生成済み帳票を確認し受取完了 |
| 6. 次の期間へ | BS 繰越・再振替・固定資産データの引き継ぎを確認 |

仮締め (`runPreClosing`) は `journalizing → pre_closing`、本締め (`runFinal`) は `pre_closing → post_closing` に遷移させる。本締め前なら `cancelPreClosing` で記帳に戻れる。

減価償却・再振替・家事按分の自動仕訳を仮帳票に含め、本締め時に保存する。サーバーが保存済みデータから再計算して検証するため、仮帳票と確定帳票の数字は一致する。

---

## 7. 財務帳票 (Financial Reports)

| 帳票 | 説明 |
|---|---|
| 仕訳帳 (Journal) | 全仕訳を日付順に印刷用 HTML として生成 |
| 総勘定元帳 (General Ledger) | 科目ごとの残高推移を印刷用 HTML として生成 |
| 財務諸表 (Financial Statements) | 損益計算書 (PL) + 貸借対照表 (BS) を印刷用 HTML として生成 |

生成した HTML は `PrintPort.openPrint(html)` 経由でブラウザの印刷ダイアログに渡す。帳票内のすべてのユーザーデータは HTMLエスケープ済み (`escapeHtml`)。

---

## 8. 分析・トレンド (Analytics)

| 機能 | 説明 |
|---|---|
| 月次 PL トレンド | 期間内の各月の売上・費用・利益をグラフ表示 (`buildStepTrendPoints`)。未確定の減価償却・再振替を含め、各仕訳で直接按分するため期末の家事按分振替は二重計上しない |
| FS サマリー | 期末時点の PL/BS を数値で表示 (`computeFsAggregate`) |
| 科目別内訳 | 売上・費用の科目別貢献度を計算 (`computeRevenueContribution` / `computeExpenseContribution`) |

---

## 9. ストレージ (Storage)

| アダプタ | 用途 | 永続化 |
|---|---|---|
| `file-db-adapter` | SQLite OPFS (ブラウザ内ファイルDB) | ブラウザを閉じても保持 (PWA) |
| `memory-db-adapter` | インメモリ (揮発) | ページリロードでリセット |

どちらも `OpenkkDbPort` を実装しており差し替え可能。SQLとマイグレーションは `sqlite-adapter` で共有する。

---

## 10. デフォルトマスターデータ (Built-in Master Data)

オープン会計 は個人事業主の青色申告を想定したデフォルト勘定科目・税区分・事業区分を内蔵する。

| データ | 定数 | 内容 |
|---|---|---|
| 勘定科目 | `DEFAULT_BOOK_ACCOUNTS` | 資産・負債・純資産・収益・費用の主要科目 219 件（専従者給与を含む） |
| 税区分 | `DEFAULT_TAX_CATEGORIES` | 課税 10% / 軽減税率 8% / 免税 / 非課税 / 対象外（5件） |
| 事業区分 | `DEFAULT_BUSINESS_CATEGORIES` | 第1〜第6種・対象外 (みなし仕入率区分、7件) |

勘定科目は既定IDのみ、税区分・事業区分は既定IDと利用者定義値を受け付ける。

---

## バンドル一覧

版は実行時切替ではなく **バンドル（別パッケージのアプリ）** で分ける。`bundle`（版）・`env`（実行環境）・`brand`（ロゴ/表示名）は直交した独立概念。

| bundle | パッケージ | 表示名 (`bundleLabel`) | DB | シードデータ | 認証 |
|---|---|---|---|---|---|
| `sim` | `@rubydogjp/openkk-sim` (`packages/openkk_sim`) | Sim版 | memory + 固定時計 | なし (任意に作成) | embedded |
| `demo` | `@rubydogjp/openkk-demo` (`packages/openkk_demo`) | デモ版 | memory | あり (buildOpenkkDemoSeed) | embedded |
| `original` | `@rubydogjp/openkk` (`packages/openkk`) | 無印版 | SQLite OPFS | なし | embedded |

`env`（`NEXT_PUBLIC_OPENKK_ENV` = `dev` / `stg` / `prod`、既定 `prod`）はログレベル等の実行環境のみを指し、bundle とは独立に設定する。共通配線は `@rubydogjp/openkk-frontend`（`packages/frontend`）に集約。

---

## 認証・ユーザー (Authentication)

`OpenkkUser = EmbeddedUser | CustomUser` を `OpenkkConfig.authMode` で切り替える。詳細は [`authentication.md`](./authentication.md) を参照。
