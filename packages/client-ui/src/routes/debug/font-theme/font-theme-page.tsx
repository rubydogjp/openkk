import Link from "next/link.js";
import type { CSSProperties } from "react";

import {
  fontFamily,
  fontSize,
  fontWeight,
  palette,
  radii,
  spacing,
  tokenDefaults,
  typography,
} from "../../../shared/design-tokens.js";
import { Card, Section } from "../debug-ui.js";

type TypeToken = {
  name: string;
  styleToken: keyof typeof typography;
  role: string;
  sample: string;
  description: string;
};

const typeTokens: TypeToken[] = [
  {
    name: "Fine Print",
    styleToken: "finePrint",
    role: "10px / 軸・曜日など、短いメタ表示だけ。",
    sample: "05/21 WED",
    description: "グラフ軸やカレンダーなど、表示密度が高い場所に限定する。",
  },
  {
    name: "Meta",
    styleToken: "meta",
    role: "11px / ラベルより弱い補助メタ。",
    sample: "最終更新 12:34",
    description: "更新時刻など、本文より弱いメタ情報に使う。",
  },
  {
    name: "Helper",
    styleToken: "helper",
    role: "12px / 説明・補足・validation。",
    sample: "この項目はあとから変更できます。",
    description: "入力補助や検証メッセージなど、本文を支える説明に使う。",
  },
  {
    name: "Body",
    styleToken: "body",
    role: "13px / アプリ本文とテーブル本文の標準。",
    sample: "売上、経費、決算整理を順番に確認します。",
    description: "本文とテーブルの標準サイズとして使う。",
  },
  {
    name: "Input",
    styleToken: "input",
    role: "14px / 入力値と steps の導入文。",
    sample: "5月分 売上入金",
    description: "編集対象の値と、手順ページの短い導入文に使う。",
  },
  {
    name: "Label",
    styleToken: "label",
    role: "12px / フォーム・表ヘッダー・固定ラベル。",
    sample: "取引日",
    description: "入力欄や列の意味を示す固定ラベルに使う。",
  },
  {
    name: "Control",
    styleToken: "control",
    role: "13px / ボタン・select・menu item。",
    sample: "追加",
    description: "ボタンやメニューなど、操作できる要素に使う。",
  },
  {
    name: "Amount",
    styleToken: "amount",
    role: "13px / 金額・数値列。",
    sample: "1,234,567",
    description: "等幅フォントで桁を揃える金額・数値列に使う。",
  },
  {
    name: "Chip",
    styleToken: "chip",
    role: "12px / 取引先・事業割合などのタグ。",
    sample: "取引先: RubyDog",
    description: "取引先や事業割合などの補助属性に使う。",
  },
  {
    name: "Account Label",
    styleToken: "accountLabel",
    role: "13px / 勘定科目コンテナ。",
    sample: "売上高",
    description: "仕訳行の主情報となる勘定科目名に使う。",
  },
  {
    name: "Section Title",
    styleToken: "sectionTitle",
    role: "15px / カード・drawer 内の小見出し。",
    sample: "取引情報",
    description: "カードや drawer 内の小見出しに使う。",
  },
  {
    name: "Content Title",
    styleToken: "contentTitle",
    role: "18px / steps の H2 相当。",
    sample: "月別の収支推移を確認する",
    description: "手順ページ本文の章見出しに使う。",
  },
  {
    name: "Dialog Title",
    styleToken: "dialogTitle",
    role: "20px / モーダル・空状態の短い独立タイトル。",
    sample: "期間がロックされています",
    description: "モーダルや空状態の独立したタイトルに使う。",
  },
  {
    name: "Page Title",
    styleToken: "pageTitle",
    role: "24px / ページ H1。",
    sample: "決算書を作成する",
    description: "通常画面の最上位タイトルに使う。",
  },
];

const familyTokens = [
  {
    name: "NotoSansJP",
    value: fontFamily.sans,
    role: "アプリ本文、chrome、フォーム、steps の docs 風コンテンツ。原則すべての和文 UI はこれを使う。",
  },
  {
    name: "NotoSansMono",
    value: fontFamily.mono,
    role: "金額、数値列、コード風の token 表示。等幅が必要な場面だけに限定する。",
  },
] as const;

const weightTokens = [
  {
    name: "Regular",
    value: fontWeight.regular,
    role: "本文・説明・タグ。読む量が多い場所。",
  },
  {
    name: "Medium",
    value: fontWeight.medium,
    role: "Meta や弱い選択状態。多用しない中間 weight。",
  },
  {
    name: "Semibold",
    value: fontWeight.semibold,
    role: "ラベル・ボタン・数値。操作や構造を示す。",
  },
  {
    name: "Bold",
    value: fontWeight.bold,
    role: "見出し・勘定科目・重要な値。最大 weight。",
  },
] as const;

const buttonBase: CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: radii.sm,
  border: "1px solid transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  ...typography.control,
};

export function FontThemePage() {
  if (false) {
    return (
      <section style={{ padding: spacing.s24 }}>
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            color: palette.textSoft,
            fontWeight: fontWeight.semibold,
          }}
        >
          この画面は dev 環境専用です
        </div>
      </section>
    );
  }

  return (
    <main
      style={{
        background: palette.pageBg,
        color: palette.text,
        minHeight: "100vh",
        padding: spacing.s24,
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Link
          href="/debug"
          style={{ ...typography.control, color: palette.action }}
        >
          ← debug
        </Link>

        <header style={{ marginTop: spacing.s16, marginBottom: spacing.s24 }}>
          <div
            style={{
              ...typography.meta,
              color: palette.textLabel,
              letterSpacing: "0.08em",
            }}
          >
            TYPOGRAPHY THEME
          </div>
          <h1 style={{ ...typography.pageTitle, margin: "6px 0 0" }}>
            OpenKK Font Theme
          </h1>
          <p
            style={{
              ...typography.body,
              maxWidth: 780,
              margin: "10px 0 0",
              color: palette.textSoft,
            }}
          >
            一般的な type scale
            の考え方に合わせ、サイズを増やすのではなく役割を減らして整理します。
            基本フォントは NotoSansJP、金額・等幅表示だけ NotoSansMono
            です。その他のフォントはフォント読み込み失敗時の最終 fallback
            に限ります。
          </p>
        </header>

        <Section
          title="Font Families"
          lead="フォントファミリーは NotoSansJP / NotoSansMono の 2 系統へ寄せ切ります。"
        >
          <div style={gridStyle}>
            {familyTokens.map((token) => (
              <Card key={token.name} style={null}>
                <div style={{ ...typography.sectionTitle }}>{token.name}</div>
                <code style={codeStyle}>{token.value}</code>
                <p
                  style={{
                    ...typography.body,
                    color: palette.textSoft,
                    margin: "10px 0 0",
                  }}
                >
                  {token.role}
                </p>
                <div
                  style={{
                    marginTop: spacing.s14,
                    padding: spacing.s14,
                    borderRadius: radii.md,
                    border: `1px solid ${palette.borderSubtle}`,
                    background: palette.surfaceTint,
                    fontFamily: token.value,
                    ...typography.input,
                  }}
                >
                  {token.name === "NotoSansMono"
                    ? "1,234,567 / 2026-05-21"
                    : "青色申告の決算整理を確認します。"}
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          title="Type Scale"
          lead="用途ごとに一つの token を選びます。"
        >
          <div style={{ display: "grid", gap: spacing.s10 }}>
            {typeTokens.map((token) => (
              <TypeRow key={token.name} token={token} />
            ))}
          </div>
        </Section>

        <Section
          title="Weights"
          lead="800 / 900 は使わず、400 / 500 / 600 / 700 の 4 段階に制限します。"
        >
          <div style={gridStyle}>
            {weightTokens.map((token) => (
              <Card key={token.name} style={null}>
                <div
                  style={{
                    fontSize: typography.pageTitle.fontSize,
                    lineHeight: 1,
                    fontWeight: token.value,
                  }}
                >
                  {token.value}
                </div>
                <div
                  style={{
                    marginTop: spacing.s10,
                    fontSize: fontSize.lg,
                    fontWeight: token.value,
                  }}
                >
                  {token.name}
                </div>
                <p
                  style={{
                    ...typography.body,
                    color: palette.textSoft,
                    margin: "8px 0 0",
                  }}
                >
                  {token.role}
                </p>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          title="Application Sample"
          lead="steps の docs 風本文、フォーム、entries テーブルを同じ体系で確認します。"
        >
          <div style={{ display: "grid", gap: spacing.s16 }}>
            <DocsSample />
            <FormAndTableSample />
          </div>
        </Section>

      </div>
    </main>
  );
}

function TypeRow({ token }: { token: TypeToken }) {
  const specStyle = typography[token.styleToken];
  const specDefaults = tokenDefaults.typography[token.styleToken];
  const cssText = `${specDefaults.fontSize}px / ${specDefaults.lineHeight} / ${specDefaults.fontWeight}`;

  return (
    <Card
      style={{
        display: "grid",
        gridTemplateColumns: "160px minmax(220px, 1fr) minmax(300px, 1.5fr)",
        gap: spacing.s16,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ ...typography.sectionTitle }}>{token.name}</div>
        <code style={codeStyle}>{cssText}</code>
      </div>
      <div>
        <div style={{ ...specStyle, color: palette.text }}>{token.sample}</div>
        <div
          style={{ marginTop: 6, ...typography.meta, color: palette.textLabel }}
        >
          {token.role}
        </div>
      </div>
      <p style={{ ...typography.body, color: palette.textSoft, margin: 0 }}>
        {token.description}
      </p>
    </Card>
  );
}

function DocsSample() {
  return (
    <Card style={null}>
      <div
        style={{
          ...typography.meta,
          color: palette.textLabel,
          letterSpacing: "0.08em",
        }}
      >
        STEPS CONTENT
      </div>
      <h3 style={{ ...typography.pageTitle, margin: "6px 0 0" }}>
        月別の収支推移を確認する
      </h3>
      <p
        style={{
          ...typography.input,
          color: palette.textSoft,
          maxWidth: 720,
          margin: "12px 0 0",
        }}
      >
        収益と費用の増減を確認し、決算整理の前に大きな入力漏れがないかを見ます。
        読み物に近い領域では、本文を詰めすぎず行間を広めに保ちます。
      </p>
      <h4 style={{ ...typography.contentTitle, margin: "22px 0 8px" }}>
        確認するポイント
      </h4>
      <ul
        style={{
          ...typography.body,
          color: palette.text,
          margin: 0,
          paddingLeft: 20,
        }}
      >
        <li style={{ margin: "6px 0" }}>
          売上が急に落ちている月に未入力の入金がないか確認します。
        </li>
        <li style={{ margin: "6px 0" }}>
          経費が大きい月は摘要と証憑を見直します。
        </li>
      </ul>
      <div
        style={{
          marginTop: spacing.s16,
          background: palette.actionBg,
          border: `1px solid ${palette.actionBorder}`,
          borderRadius: radii.md,
          padding: spacing.s14,
          ...typography.body,
          color: palette.text,
        }}
      >
        コメントやガイド文は 12px 未満にせず、本文と同じ読みやすさに寄せます。
      </div>
    </Card>
  );
}

function FormAndTableSample() {
  return (
    <Card style={null}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 0.9fr) minmax(360px, 1.1fr)",
          gap: spacing.s16,
        }}
      >
        <div>
          <h3 style={{ ...typography.sectionTitle, margin: 0 }}>
            Form / Buttons
          </h3>
          <label
            style={{ display: "grid", gap: spacing.s6, marginTop: spacing.s14 }}
          >
            <span style={{ ...typography.label, color: palette.textLabel }}>
              摘要
            </span>
            <input
              value="5月分 売上入金"
              readOnly
              style={{
                height: 40,
                borderRadius: radii.sm,
                border: `1px solid ${palette.borderStrong}`,
                background: palette.surface,
                padding: "0 12px",
                color: palette.text,
                fontFamily: "inherit",
                ...typography.input,
              }}
            />
          </label>
          <div
            style={{
              marginTop: spacing.s12,
              ...typography.helper,
              color: palette.textSoft,
            }}
          >
            入力値は 14px、補足説明は
            12px。本文と補足の差を視認できる範囲に留めます。
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: spacing.s8,
              marginTop: spacing.s16,
            }}
          >
            <button
              style={{
                ...buttonBase,
                background: palette.action,
                color: palette.textOnDark,
              }}
            >
              追加
            </button>
            <button
              style={{
                ...buttonBase,
                background: palette.surface,
                color: palette.action,
                borderColor: palette.actionBorder,
              }}
            >
              キャンセル
            </button>
            <button
              style={{
                ...buttonBase,
                background: palette.decision,
                color: palette.textOnDark,
              }}
            >
              確定
            </button>
            <button
              style={{
                ...buttonBase,
                background: palette.danger,
                color: palette.textOnDark,
              }}
            >
              削除
            </button>
            <button
              style={{
                ...buttonBase,
                background: palette.surfaceTint,
                color: palette.textSoft,
                borderColor: palette.borderSubtle,
              }}
            >
              詳細
            </button>
          </div>
        </div>

        <div>
          <h3 style={{ ...typography.sectionTitle, margin: 0 }}>
            Entries Table
          </h3>
          <div
            style={{
              marginTop: spacing.s14,
              border: `1px solid ${palette.borderSubtle}`,
              borderRadius: radii.md,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 110px",
                background: palette.headerSurface,
                borderBottom: `1px solid ${palette.borderSubtle}`,
              }}
            >
              {["日付", "勘定科目 / 摘要", "金額"].map((header) => (
                <div
                  key={header}
                  style={{
                    padding: "8px 10px",
                    ...typography.label,
                    color: palette.textLabel,
                  }}
                >
                  {header}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 110px",
                alignItems: "center",
              }}
            >
              <div style={{ padding: 10, ...typography.body }}>05/21</div>
              <div style={{ padding: 10 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    width: 112,
                    minHeight: 28,
                    padding: "0 10px",
                    borderRadius: radii.sm,
                    background: palette.accountRevenueBg,
                    border: `1px solid ${palette.accountRevenueBorder}`,
                    color: palette.accountRevenue,
                    ...typography.accountLabel,
                  }}
                >
                  売上高
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 30,
                    marginLeft: spacing.s8,
                    padding: "0 9px",
                    borderRadius: radii.pill,
                    background: palette.surfaceTint,
                    border: `1px solid ${palette.borderSubtle}`,
                    color: palette.textSoft,
                    ...typography.chip,
                  }}
                >
                  取引先: RubyDog
                </span>
              </div>
              <div
                style={{
                  padding: 10,
                  textAlign: "right",
                  color: palette.text,
                  ...typography.amount,
                }}
              >
                88,000
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: spacing.s12,
};

const codeStyle: CSSProperties = {
  display: "block",
  marginTop: spacing.s8,
  padding: "6px 8px",
  borderRadius: radii.xs,
  background: palette.surfaceTint,
  border: `1px solid ${palette.borderSubtle}`,
  color: palette.textSoft,
  fontFamily: fontFamily.mono,
  fontSize: fontSize.xs,
  lineHeight: 1.5,
  wordBreak: "break-word",
};
