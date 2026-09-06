"use client";

import type { ReactNode } from "react";

import { fontFamily, fontSize, fontWeight, palette } from "./design-tokens.js";
import {
  resolveEquityBlock,
  resolveProfitBlock,
  type DiagramResultBlock,
} from "./pl-bs-diagram-model.js";

const PANEL_HEIGHT = 180;
const BLOCK_GAP = 3;
const CORNER_RADIUS = 10;

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

type DiagramBlock = {
  label: string;
  amount: number;
  icon: string;
  foreground: string;
  background: string;
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
  const result = resolveProfitBlock(pl.profit);
  const expenses = block(
    "費用",
    pl.expenses,
    "/icons/expense.svg",
    palette.accountExpense,
    palette.accountExpenseBg,
  );
  const revenue = block(
    "収益",
    pl.revenue,
    "/icons/revenue.svg",
    palette.accountRevenue,
    palette.accountRevenueBg,
  );
  const resultBlock = financialResultBlock(result, "/icons/profit.svg");

  return (
    <DiagramPanel title="損益計算書 (PL)">
      <DiagramColumn
        side="left"
        blocks={result.side === "left" ? [expenses, resultBlock] : [expenses]}
      />
      <DiagramColumn
        side="right"
        blocks={result.side === "right" ? [revenue, resultBlock] : [revenue]}
      />
    </DiagramPanel>
  );
}

function BSPanel({ bs }: { bs: BSData }) {
  const result = resolveEquityBlock(bs.equity);
  const assets = block(
    "資産",
    bs.assets,
    "/icons/assets.svg",
    palette.accountAsset,
    palette.accountAssetBg,
  );
  const liabilities = block(
    "負債",
    bs.liabilities,
    "/icons/liabilities.svg",
    palette.accountLiability,
    palette.accountLiabilityBg,
  );
  const resultBlock = financialResultBlock(result, "/icons/net-assets.svg");

  return (
    <DiagramPanel title="貸借対照表 (BS)">
      <DiagramColumn
        side="left"
        blocks={result.side === "left" ? [assets, resultBlock] : [assets]}
      />
      <DiagramColumn
        side="right"
        blocks={
          result.side === "right" ? [liabilities, resultBlock] : [liabilities]
        }
      />
    </DiagramPanel>
  );
}

function DiagramPanel(props: { title: string; children: ReactNode }) {
  return (
    <div style={{ flex: "1 1 220px", minWidth: 220 }}>
      <div
        style={{
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          color: palette.textSoft,
          marginBottom: 6,
        }}
      >
        {props.title}
      </div>
      <div style={{ display: "flex", gap: BLOCK_GAP, height: PANEL_HEIGHT }}>
        {props.children}
      </div>
    </div>
  );
}

function DiagramColumn(props: {
  side: "left" | "right";
  blocks: DiagramBlock[];
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: BLOCK_GAP,
      }}
    >
      {props.blocks.map((item, index) => (
        <DiagramBlockView
          key={item.label}
          block={item}
          side={props.side}
          index={index}
          count={props.blocks.length}
        />
      ))}
    </div>
  );
}

function DiagramBlockView(props: {
  block: DiagramBlock;
  side: "left" | "right";
  index: number;
  count: number;
}) {
  const isFirst = props.index === 0;
  const isLast = props.index === props.count - 1;
  const topLeft = props.side === "left" && isFirst ? CORNER_RADIUS : 0;
  const topRight = props.side === "right" && isFirst ? CORNER_RADIUS : 0;
  const bottomRight = props.side === "right" && isLast ? CORNER_RADIUS : 0;
  const bottomLeft = props.side === "left" && isLast ? CORNER_RADIUS : 0;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: props.block.background,
        border: `1px solid ${props.block.foreground}`,
        borderRadius: `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "6px 8px",
        boxSizing: "border-box",
      }}
    >
      <DiagramLabel
        icon={props.block.icon}
        color={props.block.foreground}
        label={props.block.label}
      />
      <span
        style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.bold,
          color: props.block.foreground,
          fontFamily: fontFamily.mono,
        }}
      >
        {formatDiagramYen(props.block.amount)}
      </span>
    </div>
  );
}

function financialResultBlock(
  result: DiagramResultBlock,
  icon: string,
): DiagramBlock {
  const negative = result.tone === "negative";
  return block(
    result.label,
    result.amount,
    icon,
    negative ? palette.danger : palette.accountProfit,
    negative ? palette.dangerBg : palette.accountProfitBg,
  );
}

function block(
  label: string,
  amount: number,
  icon: string,
  foreground: string,
  background: string,
): DiagramBlock {
  return { label, amount, icon, foreground, background };
}

function formatDiagramYen(value: number): string {
  const absolute = Math.abs(Math.round(value));
  const formatted = new Intl.NumberFormat("ja-JP").format(absolute);
  return value < 0 ? `-¥${formatted}` : `¥${formatted}`;
}

function DiagramLabel(props: { icon: string; color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        color: props.color,
      }}
    >
      <AccountIcon icon={props.icon} color={props.color} size={14} />
      <span>{props.label}</span>
    </span>
  );
}

function AccountIcon(props: { icon: string; color: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: props.size,
        height: props.size,
        display: "block",
        flexShrink: 0,
        backgroundColor: props.color,
        maskImage: `url('${props.icon}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${props.icon}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
