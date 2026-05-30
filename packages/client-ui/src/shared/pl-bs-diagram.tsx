"use client";

import { fontFamily, fontSize, fontWeight, palette } from "./design-tokens";

const PANEL_H = 180;
const GAP = 3;
const BORDER = 1;
const R = 10;

function formatDiagramYen(value: number): string {
  const abs = Math.abs(Math.round(value));
  const formatted = new Intl.NumberFormat("ja-JP").format(abs);
  return value < 0 ? `-¥${formatted}` : `¥${formatted}`;
}

type PLData = {
  revenue: number;
  expenses: number;
  profit: number;
};

type BSData = {
  assets: number;
  liabilities: number;
  equity: number;
};

export function PlBsDiagramSection(props: { pl: PLData; bs?: BSData }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <PLPanel pl={props.pl} />
      {props.bs != null ? <BSPanel bs={props.bs} /> : null}
    </div>
  );
}

function PLPanel({ pl }: { pl: PLData }) {
  const { revenue, expenses, profit } = pl;
  const hasSeparate = profit > 0;

  const halfH = Math.floor((PANEL_H - GAP) / 2);
  const expenseH = hasSeparate ? halfH : PANEL_H;
  const profitH = hasSeparate ? PANEL_H - GAP - halfH : 0;

  return (
    <div style={{ flex: "1 1 220px", minWidth: 220 }}>
      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.textSoft, marginBottom: 6 }}>
        損益計算書 (PL)
      </div>
      <div style={{ display: "flex", gap: GAP, height: PANEL_H }}>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: expenseH,
              background: palette.accountExpenseBg,
              border: `${BORDER}px solid ${palette.accountExpense}`,
              borderRadius: hasSeparate ? `${R}px 0 0 0` : `${R}px 0 0 ${R}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "6px 8px",
              boxSizing: "border-box",
            }}
          >
            <DiagramLabel icon="/icons/expense.svg" color={palette.accountExpense} label="費用" />
            <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.accountExpense, fontFamily: fontFamily.mono }}>
              {formatDiagramYen(expenses)}
            </span>
          </div>
          {hasSeparate ? (
            <>
              <div style={{ height: GAP }} />
              <div
                style={{
                  height: profitH,
                  background: palette.accountProfitBg,
                  border: `${BORDER}px solid ${palette.accountProfit}`,
                  borderRadius: `0 0 0 ${R}px`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  padding: "6px 8px",
                  boxSizing: "border-box",
                }}
              >
                <DiagramLabel icon="/icons/profit.svg" color={palette.accountProfit} label="利益" />
                <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.accountProfit, fontFamily: fontFamily.mono }}>
                  {formatDiagramYen(profit)}
                </span>
              </div>
            </>
          ) : null}
        </div>

        <div
          style={{
            flex: 1,
            height: PANEL_H,
            background: palette.accountRevenueBg,
            border: `${BORDER}px solid ${palette.accountRevenue}`,
            borderRadius: `0 ${R}px ${R}px 0`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            padding: "6px 8px",
            boxSizing: "border-box",
          }}
        >
          <DiagramLabel icon="/icons/revenue.svg" color={palette.accountRevenue} label="収益" />
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.accountRevenue, fontFamily: fontFamily.mono }}>
            {formatDiagramYen(revenue)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BSPanel({ bs }: { bs: BSData }) {
  const { assets, liabilities, equity } = bs;
  const hasSeparate = equity > 0;

  const halfH = Math.floor((PANEL_H - GAP) / 2);
  const liabilityH = hasSeparate ? halfH : PANEL_H;
  const equityH = hasSeparate ? PANEL_H - GAP - halfH : 0;

  return (
    <div style={{ flex: "1 1 220px", minWidth: 220 }}>
      <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.textSoft, marginBottom: 6 }}>
        貸借対照表 (BS)
      </div>
      <div style={{ display: "flex", gap: GAP, height: PANEL_H }}>

        <div
          style={{
            flex: 1,
            height: PANEL_H,
            background: palette.accountAssetBg,
            border: `${BORDER}px solid ${palette.accountAsset}`,
            borderRadius: `${R}px 0 0 ${R}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            padding: "6px 8px",
            boxSizing: "border-box",
          }}
        >
          <DiagramLabel icon="/icons/assets.svg" color={palette.accountAsset} label="資産" />
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.accountAsset, fontFamily: fontFamily.mono }}>
            {formatDiagramYen(assets)}
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: liabilityH,
              background: palette.accountLiabilityBg,
              border: `${BORDER}px solid ${palette.accountLiability}`,
              borderRadius: hasSeparate ? `0 ${R}px 0 0` : `0 ${R}px ${R}px 0`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "6px 8px",
              boxSizing: "border-box",
            }}
          >
            <DiagramLabel icon="/icons/liabilities.svg" color={palette.accountLiability} label="負債" />
            <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.accountLiability, fontFamily: fontFamily.mono }}>
              {formatDiagramYen(liabilities)}
            </span>
          </div>
          {hasSeparate ? (
            <>
              <div style={{ height: GAP }} />
              <div
                style={{
                  height: equityH,
                  background: palette.accountEquityBg,
                  border: `${BORDER}px solid ${palette.accountEquity}`,
                  borderRadius: `0 0 ${R}px 0`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  padding: "6px 8px",
                  boxSizing: "border-box",
                }}
              >
                <DiagramLabel icon="/icons/net-assets.svg" color={palette.accountEquity} label="純資産" />
                <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.accountEquity, fontFamily: fontFamily.mono }}>
                  {formatDiagramYen(equity)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DiagramLabel({ icon, color, label }: { icon: string; color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: fontSize.xs, fontWeight: fontWeight.bold, color }}>
      <AccountIcon icon={icon} color={color} size={14} />
      <span>{label}</span>
    </span>
  );
}

function AccountIcon({ icon, color, size }: { icon: string; color: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "block",
        flexShrink: 0,
        backgroundColor: color,
        maskImage: `url('${icon}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${icon}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
