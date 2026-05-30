"use client";

import { useEffect, useRef, useState } from "react";

import { fontSize, fontWeight, palette } from "../shared/design-tokens";

export function ClosingExplainerAnimation({
  onCompleted,
}: {
  onCompleted?: () => void;
}) {
  const DURATION = 8000;
  const [width, setWidth] = useState(0);
  const [t, setT] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWidth(rect.width);
    });
    obs.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const step = (timestamp: number) => {
      if (startTimeRef.current == null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const newT = Math.min(elapsed / DURATION, 1);
      setT(newT);
      if (newT < 1) {
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
        <ClosingAnimFrame t={t} w={width - 48} />
      ) : (
        <div style={{ height: 245 }} />
      )}
    </div>
  );
}

function ClosingAnimFrame({ t, w }: { t: number; w: number }) {
  const cellH = 28;
  const g = 3;
  const tg = 24;

  const halfW = (w - tg) / 2;
  const cellW = (halfW - g) / 2;
  const initOx = (w - (2 * cellW + g)) / 2;

  const initH = 8 * cellH + 7 * g;
  const plOy = (initH - (4 * cellH + 3 * g)) / 2;
  const bsOy = (initH - (6 * cellH + 5 * g)) / 2;

  const isWobbling = t >= 0.125 && t < 0.375;
  const wobbleT = isWobbling ? (t - 0.125) / 0.25 : 0;
  const wobbleAngle = isWobbling
    ? Math.sin(wobbleT * Math.PI * 4) * ((10 * Math.PI) / 180) * Math.sin(wobbleT * Math.PI)
    : 0;

  const moveRaw = Math.max(0, Math.min(1, (t - 0.375) / 0.1875));
  const move = easeInOutCubic(moveRaw);
  const labelAlpha = Math.max(0, Math.min(1, (t - 0.45) / 0.12));
  const profitT = Math.max(0, Math.min(1, (t - 0.6875) / 0.09375));

  const ix = (c: number) => initOx + c * (cellW + g);
  const iy = (r: number) => r * (cellH + g);
  const px = (c: number) => c * (cellW + g);
  const bx = (c: number) => halfW + tg + c * (cellW + g);
  const ply = (r: number) => plOy + r * (cellH + g);
  const bsy = (r: number) => bsOy + r * (cellH + g);
  const lerp = (a: number, b: number, v: number) => a + (b - a) * v;

  type AccountVisual = { color: string; bg: string; icon: string };
  type CellDef = [label: string, visual: AccountVisual, sx: number, sy: number, ex: number, ey: number, wobbles: boolean];
  const asset = { color: palette.accountAsset, bg: palette.accountAssetBg, icon: "/icons/assets.svg" };
  const liability = { color: palette.accountLiability, bg: palette.accountLiabilityBg, icon: "/icons/liabilities.svg" };
  const equity = { color: palette.accountEquity, bg: palette.accountEquityBg, icon: "/icons/net-assets.svg" };
  const revenue = { color: palette.accountRevenue, bg: palette.accountRevenueBg, icon: "/icons/revenue.svg" };
  const expense = { color: palette.accountExpense, bg: palette.accountExpenseBg, icon: "/icons/expense.svg" };
  const profit = { color: palette.accountProfit, bg: palette.accountProfitBg, icon: "/icons/profit.svg" };
  const defs: CellDef[] = [
    ["資産", asset, ix(0), iy(0), bx(0), bsy(0), false],
    ["資産", asset, ix(0), iy(1), bx(0), bsy(1), false],
    ["費用", expense, ix(0), iy(2), px(0), ply(0), true],
    ["資産", asset, ix(0), iy(3), bx(0), bsy(2), false],
    ["資産", asset, ix(0), iy(4), bx(0), bsy(3), false],
    ["費用", expense, ix(0), iy(5), px(0), ply(1), true],
    ["資産", asset, ix(0), iy(6), bx(0), bsy(4), false],
    ["資産", asset, ix(0), iy(7), bx(0), bsy(5), false],
    ["負債", liability, ix(1), iy(0), bx(1), bsy(0), false],
    ["負債", liability, ix(1), iy(1), bx(1), bsy(1), false],
    ["純資産", equity, ix(1), iy(2), bx(1), bsy(2), false],
    ["純資産", equity, ix(1), iy(3), bx(1), bsy(3), false],
    ["収益", revenue, ix(1), iy(4), px(1), ply(0), true],
    ["収益", revenue, ix(1), iy(5), px(1), ply(1), true],
    ["収益", revenue, ix(1), iy(6), px(1), ply(2), true],
    ["収益", revenue, ix(1), iy(7), px(1), ply(3), true],
  ];

  const profitOp = blinkFadeIn(profitT);

  return (
    <div style={{ position: "relative", height: initH, userSelect: "none" }}>
      {labelAlpha > 0 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: plOy - 18,
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
              left: halfW + tg,
              top: bsOy - 18,
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

      {defs.map(([label, visual, sx, sy, ex, ey, wobbles], i) => {
        const x = lerp(sx, ex, move);
        const y = lerp(sy, ey, move);
        const angle = isWobbling && wobbles ? wobbleAngle : 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: cellW,
              height: cellH,
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
            <AccountIcon icon={visual.icon} color={visual.color} size={10} />
            <span>{label}</span>
          </div>
        );
      })}

      {profitOp > 0 ? (
        <>
          {[2, 3].map((r) => (
            <div
              key={`profit-${r}`}
              style={{
                position: "absolute",
                left: px(0),
                top: ply(r),
                width: cellW,
                height: cellH,
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
                opacity: profitOp,
              }}
            >
              <AccountIcon icon={profit.icon} color={profit.color} size={10} />
              <span>利益</span>
            </div>
          ))}
          {[4, 5].map((r) => (
            <div
              key={`surplus-${r}`}
              style={{
                position: "absolute",
                left: bx(1),
                top: bsy(r),
                width: cellW,
                height: cellH,
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
                opacity: profitOp,
              }}
            >
              <AccountIcon icon={equity.icon} color={equity.color} size={10} />
              <span>剰余金</span>
            </div>
          ))}
        </>
      ) : null}
    </div>
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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function blinkFadeIn(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.max(0, Math.min(1, t + Math.sin(t * Math.PI * 6) * 0.3 * (1 - t * t)));
}
