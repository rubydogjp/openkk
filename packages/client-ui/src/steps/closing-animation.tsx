"use client";

import { useEffect, useRef, useState } from "react";

import { fontSize, fontWeight, palette } from "../shared/design-tokens.js";
import { MaskIcon } from "../shared/icons.js";

const ANIMATION_DURATION_MS = 8000;

export function ClosingExplainerAnimation({
  onCompleted,
}: {
  onCompleted: (() => void) | null;
}) {
  const [width, setWidth] = useState(0);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWidth(rect.width);
    });
    observer.observe(container);
    setWidth(container.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const step = (timestamp: number) => {
      if (startTimeRef.current == null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const nextProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      setProgress(nextProgress);
      if (nextProgress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        onCompletedRef.current?.();
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {width > 50 ? (
        <ClosingAnimationFrame progress={progress} width={width - 48} />
      ) : (
        <div style={{ height: 245 }} />
      )}
    </div>
  );
}

function ClosingAnimationFrame({
  progress,
  width,
}: {
  progress: number;
  width: number;
}) {
  const cellHeight = 28;
  const cellGap = 3;
  const statementGap = 24;

  const statementWidth = (width - statementGap) / 2;
  const cellWidth = (statementWidth - cellGap) / 2;
  const initialOffsetX = (width - (2 * cellWidth + cellGap)) / 2;

  const frameHeight = 8 * cellHeight + 7 * cellGap;
  const plOffsetY = (frameHeight - (4 * cellHeight + 3 * cellGap)) / 2;
  const bsOffsetY = (frameHeight - (6 * cellHeight + 5 * cellGap)) / 2;

  const isWobbling = progress >= 0.125 && progress < 0.375;
  const wobbleProgress = isWobbling ? (progress - 0.125) / 0.25 : 0;
  const wobbleAngle = isWobbling
    ? Math.sin(wobbleProgress * Math.PI * 4) *
      ((10 * Math.PI) / 180) *
      Math.sin(wobbleProgress * Math.PI)
    : 0;

  const move = easeInOutCubic(clampUnit((progress - 0.375) / 0.1875));
  const labelAlpha = clampUnit((progress - 0.45) / 0.12);
  const profitOpacity = blinkFadeIn(clampUnit((progress - 0.6875) / 0.09375));

  const columnX = (column: number) => column * (cellWidth + cellGap);
  const rowY = (row: number) => row * (cellHeight + cellGap);
  const initialX = (column: number) => initialOffsetX + columnX(column);
  const plX = (column: number) => columnX(column);
  const bsX = (column: number) =>
    statementWidth + statementGap + columnX(column);
  const plY = (row: number) => plOffsetY + rowY(row);
  const bsY = (row: number) => bsOffsetY + rowY(row);
  const lerp = (from: number, to: number, amount: number) =>
    from + (to - from) * amount;

  type AccountVisual = { color: string; bg: string; icon: string };
  type Cell = [
    label: string,
    visual: AccountVisual,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    wobbles: boolean,
  ];
  const asset = { color: palette.accountAsset, bg: palette.accountAssetBg, icon: "/icons/assets.svg" };
  const liability = { color: palette.accountLiability, bg: palette.accountLiabilityBg, icon: "/icons/liabilities.svg" };
  const equity = { color: palette.accountEquity, bg: palette.accountEquityBg, icon: "/icons/net-assets.svg" };
  const revenue = { color: palette.accountRevenue, bg: palette.accountRevenueBg, icon: "/icons/revenue.svg" };
  const expense = { color: palette.accountExpense, bg: palette.accountExpenseBg, icon: "/icons/expense.svg" };
  const profit = { color: palette.accountProfit, bg: palette.accountProfitBg, icon: "/icons/profit.svg" };
  const cells: Cell[] = [
    ["資産", asset, initialX(0), rowY(0), bsX(0), bsY(0), false],
    ["資産", asset, initialX(0), rowY(1), bsX(0), bsY(1), false],
    ["費用", expense, initialX(0), rowY(2), plX(0), plY(0), true],
    ["資産", asset, initialX(0), rowY(3), bsX(0), bsY(2), false],
    ["資産", asset, initialX(0), rowY(4), bsX(0), bsY(3), false],
    ["費用", expense, initialX(0), rowY(5), plX(0), plY(1), true],
    ["資産", asset, initialX(0), rowY(6), bsX(0), bsY(4), false],
    ["資産", asset, initialX(0), rowY(7), bsX(0), bsY(5), false],
    ["負債", liability, initialX(1), rowY(0), bsX(1), bsY(0), false],
    ["負債", liability, initialX(1), rowY(1), bsX(1), bsY(1), false],
    ["純資産", equity, initialX(1), rowY(2), bsX(1), bsY(2), false],
    ["純資産", equity, initialX(1), rowY(3), bsX(1), bsY(3), false],
    ["収益", revenue, initialX(1), rowY(4), plX(1), plY(0), true],
    ["収益", revenue, initialX(1), rowY(5), plX(1), plY(1), true],
    ["収益", revenue, initialX(1), rowY(6), plX(1), plY(2), true],
    ["収益", revenue, initialX(1), rowY(7), plX(1), plY(3), true],
  ];

  return (
    <div
      style={{ position: "relative", height: frameHeight, userSelect: "none" }}
    >
      {labelAlpha > 0 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: plOffsetY - 18,
              fontSize: fontSize.xs,
              fontWeight: fontWeight.semibold,
              color: `rgba(106,110,115,${labelAlpha.toFixed(3)})`,
              whiteSpace: "nowrap",
            }}
          >
            損益計算書 (PL)
          </div>
          <div
            style={{
              position: "absolute",
              left: statementWidth + statementGap,
              top: bsOffsetY - 18,
              fontSize: fontSize.xs,
              fontWeight: fontWeight.semibold,
              color: `rgba(106,110,115,${labelAlpha.toFixed(3)})`,
              whiteSpace: "nowrap",
            }}
          >
            貸借対照表 (BS)
          </div>
        </>
      ) : null}

      {cells.map(([label, visual, startX, startY, endX, endY, wobbles], index) => {
        const angle = isWobbling && wobbles ? wobbleAngle : 0;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: lerp(startX, endX, move),
              top: lerp(startY, endY, move),
              width: cellWidth,
              height: cellHeight,
              borderRadius: 6,
              background: visual.bg,
              border: `1px solid ${visual.color}`,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              fontSize: fontSize.xs,
              fontWeight: fontWeight.semibold,
              color: visual.color,
              transform: angle !== 0 ? `rotate(${angle}rad)` : undefined,
            }}
          >
            <MaskIcon src={visual.icon} color={visual.color} size={10} />
            <span>{label}</span>
          </div>
        );
      })}

      {profitOpacity > 0 ? (
        <>
          {[2, 3].map((row) => (
            <div
              key={`profit-${row}`}
              style={{
                position: "absolute",
                left: plX(0),
                top: plY(row),
                width: cellWidth,
                height: cellHeight,
                borderRadius: 6,
                background: profit.bg,
                border: `1px solid ${profit.color}`,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: profit.color,
                opacity: profitOpacity,
              }}
            >
              <MaskIcon src={profit.icon} color={profit.color} size={10} />
              <span>利益</span>
            </div>
          ))}
          {[4, 5].map((row) => (
            <div
              key={`surplus-${row}`}
              style={{
                position: "absolute",
                left: bsX(1),
                top: bsY(row),
                width: cellWidth,
                height: cellHeight,
                borderRadius: 6,
                background: equity.bg,
                border: `1px solid ${equity.color}`,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                fontSize: fontSize.xs,
                fontWeight: fontWeight.semibold,
                color: equity.color,
                opacity: profitOpacity,
              }}
            >
              <MaskIcon src={equity.icon} color={equity.color} size={10} />
              <span>剰余金</span>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function blinkFadeIn(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return clampUnit(
    progress +
      Math.sin(progress * Math.PI * 6) * 0.3 * (1 - progress * progress),
  );
}
