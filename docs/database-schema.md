# Database Schema

標準実装の SQLite スキーマ。DDL の正本は `packages/server-ports/src/sqlite/schema.ts`。

```mermaid
erDiagram
  fiscal_periods ||--o{ entries : "logical reference"
  fiscal_periods ||--o{ fixed_assets : "logical reference"
  fiscal_periods ||--o{ closings : "logical reference"

  openkk_meta {
    TEXT key PK
    TEXT value
  }
  fiscal_periods {
    TEXT id PK
    TEXT user_id
    TEXT data "JSON: FiscalPeriodDbRecord"
    INTEGER created_at
    INTEGER updated_at
  }
  entries {
    TEXT id PK
    TEXT fiscal_period_id
    TEXT date
    TEXT data "JSON: EntryDbRecord"
    INTEGER created_at
    INTEGER updated_at
  }
  fixed_assets {
    TEXT id PK
    TEXT fiscal_period_id
    TEXT data "JSON: FixedAssetDbRecord"
    INTEGER created_at
    INTEGER updated_at
  }
  closings {
    TEXT fiscal_period_id PK
    INTEGER year PK
    INTEGER is_provisional
  }
```

`fiscal_period_id` は現在SQLiteの外部キー制約ではなく、アダプタがトランザクション内で整合性を管理する。DB Portと保存型は `db-adapter.ts` と `persistence-types.ts`、SQLite固有実装は `sqlite/` に分離している。

Indexes: `fiscal_periods(user_id)`, `entries(fiscal_period_id)`, `entries(fiscal_period_id, date)`, `fixed_assets(fiscal_period_id)`。
