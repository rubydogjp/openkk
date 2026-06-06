# オープン会計 — 機能カタログ

個人事業主向け複式簿記ライブラリ「オープン会計」が提供する機能の全体像。

---

## 1. 会計期間管理 (Fiscal Period Management)

| 機能 | 説明 |
|---|---|
| 期間の作成 | 任意の開始日・終了日で会計期間を作成 |
| 期間の選択 | 複数期間を持ちつつ対象期間を切り替え |
| 期間フェーズ | `pre_opening` → `journalizing` → `pre_closing` → `post_closing` |
| 圧縮保存 | フェーズを保持したまま `archiveStatus` を `archived` に変更 |
| ロック判定 | `buildPeriodLockMessage` / `isJournalizingActive` でステージ別の編集可否を判定 |

**実装パッケージ:** `client-domain` (ロジック), `client-usecases` (状態), `server-usecases` (永続化), `file-db-adapter`/`memory-db-adapter` (DB)

---

## 2. 仕訳入力 (Journal Entry Management)

| 機能 | 説明 |
|---|---|
| 仕訳の作成 | 借方・貸方・金額・摘要・取引先・税区分・事業区分を入力 |
| 複合仕訳 | 1 仕訳に複数の借方/貸方明細行 (`lines[]`) を持てる |
| 月次ナビゲーション | 月単位でページネーションして表示 |
| 仕訳の編集 | 行クリックでドロワーを開き各フィールドを変更 |
| 仕訳の削除 | ドロワー内の削除ボタン → 確認ダイアログで実行 |
| 事業按分率 | `businessRate` フィールドで家事按分を指定 (0–100%) |
| 簡単入力ガイド | テンプレートから借方・貸方科目を自動補完するウィザード |

**実装パッケージ:** `client-domain` (`EntryRecord`, ロジック), `client-usecases` (`OpenkkEntriesProvider`), `client-ui` (`EntryEditDrawer`), `server-usecases`, `server-ports` (`EntriesApi`)

---

## 3. ファイルインポート / エクスポート (Data Portability)

| 機能 | 形式 | 説明 |
|---|---|---|
| インポート | JSON (`.json`) | `schema: "openkk-journal-v1"` 形式の仕訳 JSON を取り込む |
| インポート | CSV (`.csv`) | ヘッダ付き CSV を取り込む。重複 `localId` はスキップ |
| エクスポート | JSON / CSV | 期間内全仕訳を任意形式でダウンロード |
| マージ | — | 既存仕訳と `localId` で突合し、新規のみ追加（重複スキップ） |

**実装パッケージ:** `client-domain` (`import-export.ts`)

---

## 4. 固定資産管理 (Fixed Asset Management)

| 機能 | 説明 |
|---|---|
| 固定資産の登録 | 名称・取得日・取得価額・耐用年数・事業按分率を入力 |
| 固定資産の編集 | 任意のタイミングで各フィールドを更新 |
| ステータス管理 | `active` / `sold` (売却済) / `disposed` (廃棄済) / `retired` (完了) |
| 減価償却バーチャル仕訳 | 当期償却費（期首〜期末／処分日の**月割**, 取得月算入の暦月ベース, 備忘価額1円で打ち切り）を自動生成 (`computePeriodDepreciation`) |
| 売却バーチャル行 | 売却済資産の処分日に「期首〜処分日の当期償却費」＋売却仕訳（処分日簿価で資産を除き、差額を固定資産売却損益）を自動生成 |
| 廃棄バーチャル行 | 廃棄済資産の処分日に「期首〜処分日の当期償却費」＋残存簿価を固定資産除却損として除却 |
| 家事按分 | 減価償却費・除却損は全額計上し、`businessRate` の個人負担分は集計時に事業主貸へ振替 |

**実装パッケージ:** `client-domain` (`virtual-entries.ts`, `fixed-asset-data.ts`), `client-usecases` (`OpenkkAssistProvider`), `client-ui` (`FixedAssetEditDrawer`), `server-ports` (`FixedAssetsApi`)

---

## 5. 期首繰越 / 再振替 (Opening Carryover)

| 機能 | 説明 |
|---|---|
| 再振替仕訳の登録 | 前期末に計上した未払・前払などを翌期首に再振替する仕訳を管理 |
| バーチャル行として表示 | 1月の仕訳一覧に「再振替」バッジ付きで自動表示 |
| 期首残高の入力 | 資産・負債の期首残高 (`openingBalanceLines`) を貸借一致で入力 |

**実装パッケージ:** `client-domain` (`opening-carryover.ts`, `demo-data.ts`), `client-usecases`, `client-ui` (`OpeningCarryoverPage`)

---

## 6. 締め処理フロー (Closing Flow)

ステップ UI が期間の状態に合わせて次のステップへ誘導する。`deriveSteps` は 6 ステップ構成で、仮締め (pre closing) は独立ステップではなく「日々の仕訳」ステップの完了操作として扱う。

| ステップ | 内容 |
|---|---|
| 1. 期間を開始 | 期間設定の確認 (開始日・終了日) |
| 2. 期首のBSを入力 | 貸借対照表の期首残高を入力 |
| 3. 日々の仕訳 | 仕訳の入力・インポート・進捗グラフの確認。完了時に `runPreClosing` で仮締めし仮の帳票3点を生成 |
| 4. 本締め | `runFinal` → 最終帳票3点を生成・財務諸表サマリー表示。`cancelPreClosing` で仮締めへ戻せる |
| 5. 書類を受け取る | 生成済み帳票を確認し受取完了 |
| 6. 次の期間へ | BS 繰越・再振替・固定資産データの引き継ぎを確認 |

仮締め (`runPreClosing`) はフェーズを `journalizing → pre_closing` に、本締め (`runFinal`) は `pre_closing → post_closing` に遷移させる。

**実装パッケージ:** `client-domain` (`step-derivation.ts`), `client-usecases` (`useOpenkkClosing`), `client-ui` (各 step body コンポーネント), `server-usecases` (`createClosingUsecase`)

---

## 7. 財務帳票 (Financial Reports)

| 帳票 | 説明 |
|---|---|
| 仕訳帳 (Journal) | 全仕訳を日付順に印刷用 HTML として生成 |
| 総勘定元帳 (General Ledger) | 科目ごとの残高推移を印刷用 HTML として生成 |
| 財務諸表 (Financial Statements) | 損益計算書 (PL) + 貸借対照表 (BS) を印刷用 HTML として生成 |

生成した HTML は `PrintPort.openPrint(html)` 経由でブラウザの印刷ダイアログに渡す。帳票内のすべてのユーザーデータは HTMLエスケープ済み (`escapeHtml`)。

**実装パッケージ:** `client-domain` (`journal-print.ts`, `general-ledger-print.ts`, `financial-statements-print.ts`, `fs-data.ts`), `client-usecases` (`usePrintDocument`), `print-adapter` (ブラウザ実装)

---

## 8. 分析・トレンド (Analytics)

| 機能 | 説明 |
|---|---|
| 月次 PL トレンド | 期間内の各月の売上・費用・利益をグラフ表示 (`buildStepTrendPoints`) |
| FS サマリー | 期末時点の PL/BS を数値で表示 (`computeFsAggregate`) |
| 科目別内訳 | 売上・費用の科目別貢献度を計算 (`computeRevenueContribution` / `computeExpenseContribution`) |

**実装パッケージ:** `client-domain` (`summary.ts`, `step-trend.ts`), `client-ui` (`analytics-page`)

---

## 9. ストレージ (Storage)

| アダプタ | 用途 | 永続化 |
|---|---|---|
| `file-db-adapter` | SQLite OPFS (ブラウザ内ファイルDB) | ブラウザを閉じても保持 (PWA) |
| `memory-db-adapter` | インメモリ (揮発) | ページリロードでリセット |

どちらも `OpenkkDbPort` を実装しており差し替え可能。`file-db-adapter` はスキーマバージョン管理付きマイグレーションを持つ。

**実装パッケージ:** `file-db-adapter`, `memory-db-adapter`, `server-ports` (`OpenkkDbPort`)

---

## 10. デフォルトマスターデータ (Built-in Master Data)

オープン会計 は個人事業主の青色申告を想定したデフォルト勘定科目・税区分・事業区分を内蔵する。

| データ | 定数 | 内容 |
|---|---|---|
| 勘定科目 | `DEFAULT_BOOK_ACCOUNTS` | 資産・負債・純資産・収益・費用の主要科目 219 件（専従者給与を含む） |
| 税区分 | `DEFAULT_TAX_CATEGORIES` | 課税 10% / 軽減8% / 対象外 |
| 事業区分 | `DEFAULT_BUSINESS_CATEGORIES` | 第1〜第6種・対象外 (みなし仕入率区分) |

**実装パッケージ:** `client-domain` (`default-master-data.ts`), `server-domain` (`master-data.ts`)

---

## テストカバレッジ

| テストレイヤー | ファイル数 | テスト数 | 対象 |
|---|---|---|---|
| ユニット | 16 | 95 | ドメインロジック・DB・パーサー |
| E2E (dev mode) | 5 | 15+ シナリオ | ブラウザ操作フルフロー |
| E2E (demo mode) | 1 | 5 (opt-in) | シードデータ・デモ表示 |
| パッケージ構造 | 1 | 6 | workspace 整合性 |

E2E は `NEXT_PUBLIC_OPENKK_MODE=dev` で起動したサーバー (port 4306) に対して実行する。
demo mode テストは `OPENKK_DEMO_URL` 環境変数が設定されている場合のみ実行される。

---

## モード一覧

| モード | 説明 | DB | シードデータ |
|---|---|---|---|
| `dev` | 開発用 | memory | なし (任意に作成) |
| `demo` | 公開デモ | memory | あり (buildOpenkkDemoSeed) |
| `prod` | PWA 無印版 (この端末に保存) | SQLite OPFS | なし |
| `stg` | ステージング | 任意 | 任意 |
