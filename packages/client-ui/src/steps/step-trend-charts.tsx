"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { StepTrendPoint } from "@rubydogjp/openkk-client-domain";
import { fontSize, fontWeight, palette } from "../shared/design-tokens";

const REVENUE_LIGHT = "rgba(21, 128, 61, 0.32)";
const EXPENSE_LIGHT = "rgba(37, 99, 235, 0.32)";

function roundedBarPath(input: {
  x: number;
  top: number;
  bottom: number;
  width: number;
  radius: number;
  roundTop: boolean;
}) {
  const left = input.x;
  const right = input.x + input.width;
  const top = input.top;
  const bottom = input.bottom;
  const radius = Math.max(
    0,
    Math.min(input.radius, (bottom - top) / 2, input.width / 2),
  );
  if (input.roundTop) {
    return `M ${left} ${bottom} L ${left} ${top + radius} Q ${left} ${top} ${left + radius} ${top} L ${right - radius} ${top} Q ${right} ${top} ${right} ${top + radius} L ${right} ${bottom} Z`;
  }
  return `M ${left} ${top} L ${left} ${bottom - radius} Q ${left} ${bottom} ${left + radius} ${bottom} L ${right - radius} ${bottom} Q ${right} ${bottom} ${right} ${bottom - radius} L ${right} ${top} Z`;
}

export function Step3TrendChart({
  points,
  detailsHref,
}: {
  points: StepTrendPoint[];
  detailsHref?: string;
}) {
  const maxAbsValue = Math.max(
    1,
    ...points.map((p) =>
      Math.max(Math.abs(p.revenue), Math.abs(p.expenses), Math.abs(p.profit)),
    ),
  );
  const niceScale = buildNiceScale(maxAbsValue);
  const minValue = niceScale.min;
  const maxValue = niceScale.max;
  const range = maxValue - minValue;

  const chartTop = 10;
  const chartBottom = 32;
  const chartHeight = 240;
  const chartInnerHeight = chartHeight - chartTop - chartBottom;
  const leftAxisWidth = 56;
  const rightPad = 8;
  const MIN_SLOT = 48;

  const plotContainerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = plotContainerRef.current;
    if (el == null) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setAvailableWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const slotWidth =
    availableWidth != null
      ? Math.max(
          MIN_SLOT,
          Math.floor((availableWidth - rightPad) / Math.max(points.length, 1)),
        )
      : MIN_SLOT;
  const plotWidth = points.length * slotWidth + rightPad;
  const ticks = buildTicks(niceScale);

  const yFor = (value: number) =>
    chartTop + ((maxValue - value) / range) * chartInnerHeight;

  const baselineY = yFor(0);

  const barWidth = Math.min(20, slotWidth * 0.38);

  const profitPath = points
    .map((p, i) => {
      const cx = i * slotWidth + slotWidth / 2;
      const y = yFor(p.profit);
      return `${i === 0 ? "M" : "L"} ${cx} ${y}`;
    })
    .join(" ");

  return (

    <div
      style={{
        background: palette.formGroupBg,
        borderRadius: 10,
        padding: "12px 14px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: leftAxisWidth,
            textAlign: "right",
            paddingRight: 6,
            fontSize: fontSize.micro,
            color: palette.textLabel,
            fontWeight: fontWeight.semibold,
          }}
        >
          (千円)
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}>
          <LegendChip label="収益" color={palette.success} />
          <LegendChip label="費用" color={palette.brand} />
          <LegendChip label="利益・損失" color="#444B55" line />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <svg width={leftAxisWidth} height={chartHeight}>
          {ticks.map((tickValue) => {
            const y = yFor(tickValue);
            return (
              <g key={tickValue}>
                <text
                  x={leftAxisWidth - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={fontSize.micro}
                  fontWeight={fontWeight.semibold}
                  fill={palette.textLabel}
                >
                  {compactYen(tickValue)}
                </text>
              </g>
            );
          })}
        </svg>

        <div ref={plotContainerRef} style={{ overflowX: "auto", flex: 1 }}>
          <svg width={plotWidth} height={chartHeight}>
              <rect x={0} y={0} width={plotWidth} height={chartHeight} fill={palette.formGroupBg} />
              <rect
                x={0}
                y={chartTop}
                width={plotWidth - rightPad}
                height={chartInnerHeight}
                fill={palette.surface}
              />
              {ticks.map((tickValue) => {
                const y = yFor(tickValue);
                return (
                  <line
                    key={`grid-${tickValue}`}
                    x1={0}
                    y1={y}
                    x2={plotWidth - rightPad}
                    y2={y}
                    stroke={tickValue === 0 ? palette.borderHeavy : palette.borderStrong}
                    strokeWidth={tickValue === 0 ? 1.2 : 0.9}
                  />
                );
              })}

              {points.map((p, i) => {
                const slotLeft = i * slotWidth;
                const cx = slotLeft + slotWidth / 2;
                const revenueTop = Math.min(yFor(p.revenue), baselineY);
                const revenueBottom = Math.max(yFor(p.revenue), baselineY);
                const expenseTop = Math.min(yFor(-p.expenses), baselineY);
                const expenseBottom = Math.max(yFor(-p.expenses), baselineY);
                return (
                  <g key={`${p.label}-${i}`}>
                    <path
                      d={roundedBarPath({
                        x: cx - barWidth / 2,
                        top: revenueTop,
                        bottom: revenueBottom,
                        width: barWidth,
                        radius: 4,
                        roundTop: true,
                      })}
                      fill={p.isCurrent ? palette.success : REVENUE_LIGHT}
                    />
                    <path
                      d={roundedBarPath({
                        x: cx - barWidth / 2,
                        top: expenseTop,
                        bottom: expenseBottom,
                        width: barWidth,
                        radius: 4,
                        roundTop: false,
                      })}
                      fill={p.isCurrent ? palette.brand : EXPENSE_LIGHT}
                    />
                    <text
                      x={cx}
                      y={chartHeight - 12}
                      textAnchor="middle"
                      fontSize={fontSize.micro}
                      fontWeight={fontWeight.semibold}
                      fill={palette.textLabel}
                    >
                      {p.label}
                    </text>
                  </g>
                );
              })}

              <line
                x1={0}
                y1={baselineY}
                x2={plotWidth - rightPad}
                y2={baselineY}
                stroke={palette.borderHeavy}
                strokeWidth={1.2}
              />

              <path d={profitPath} fill="none" stroke="#444B55" strokeWidth={1.6} />
              {points.map((p, i) => {
                const x = i * slotWidth + slotWidth / 2;
                const profitY = yFor(p.profit);

                return (
                  <g key={`pt-${p.label}-${i}`}>
                    <circle
                      cx={x}
                      cy={profitY}
                      r={p.isCurrent ? 4.2 : 3.4}
                      fill={palette.surface}
                    />
                    <circle
                      cx={x}
                      cy={profitY}
                      r={p.isCurrent ? 4.2 : 3.4}
                      fill="none"
                      stroke="#444B55"
                      strokeWidth={1.3}
                    />
                    {p.isCurrent ? (
                      <circle cx={x} cy={profitY} r={1.9} fill="#444B55" />
                    ) : null}
                  </g>
                );
              })}
            </svg>
        </div>
      </div>

      {detailsHref != null ? (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${palette.borderSubtle}`,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href={detailsHref}
            style={{
              fontSize: fontSize.sm,
              fontWeight: fontWeight.bold,
              color: palette.brand,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 6px",
              borderRadius: 6,
            }}
          >
            詳細をみる
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
              <polyline
                points="9 6 15 12 9 18"
                stroke={palette.brand}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function JournalizingCompletedTrendChart({
  points,
}: {
  points: StepTrendPoint[];
}) {
  const maxAbsValue = Math.max(
    1,
    ...points.map((p) =>
      Math.max(Math.abs(p.revenue), Math.abs(p.expenses), Math.abs(p.profit)),
    ),
  );
  const niceScale = buildNiceScale(maxAbsValue);
  const minValue = niceScale.min;
  const maxValue = niceScale.max;
  const range = maxValue - minValue;

  const chartTop = 10;
  const chartBottom = 32;
  const chartHeight = 240;
  const chartInnerHeight = chartHeight - chartTop - chartBottom;
  const leftAxisWidth = 56;
  const rightPad = 8;
  const MIN_SLOT = 48;

  const plotContainerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = plotContainerRef.current;
    if (el == null) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setAvailableWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const slotWidth =
    availableWidth != null
      ? Math.max(
          MIN_SLOT,
          Math.floor((availableWidth - rightPad) / Math.max(points.length, 1)),
        )
      : MIN_SLOT;
  const plotWidth = points.length * slotWidth + rightPad;
  const ticks = buildTicks(niceScale);

  const yFor = (value: number) =>
    chartTop + ((maxValue - value) / range) * chartInnerHeight;

  const baselineY = yFor(0);
  const barWidth = Math.min(20, slotWidth * 0.38);

  const profitPath = points
    .map((p, i) => {
      const cx = i * slotWidth + slotWidth / 2;
      const y = yFor(p.profit);
      return `${i === 0 ? "M" : "L"} ${cx} ${y}`;
    })
    .join(" ");

  return (
    <div
      style={{
        background: palette.formGroupBg,
        borderRadius: 10,
        padding: "12px 14px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: leftAxisWidth,
            textAlign: "right",
            paddingRight: 6,
            fontSize: fontSize.micro,
            color: palette.textLabel,
            fontWeight: fontWeight.semibold,
          }}
        >
          (千円)
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}>
          <LegendChip label="収益" color={palette.success} />
          <LegendChip label="費用" color={palette.brand} />
          <LegendChip label="利益・損失" color="#444B55" line />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <svg width={leftAxisWidth} height={chartHeight}>
          {ticks.map((tickValue) => {
            const y = yFor(tickValue);
            return (
              <g key={tickValue}>
                <text
                  x={leftAxisWidth - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={fontSize.micro}
                  fontWeight={fontWeight.semibold}
                  fill={palette.textLabel}
                >
                  {compactYen(tickValue)}
                </text>
              </g>
            );
          })}
        </svg>
        <div ref={plotContainerRef} style={{ overflowX: "auto", flex: 1 }}>
          <svg width={plotWidth} height={chartHeight}>
            <rect x={0} y={0} width={plotWidth} height={chartHeight} fill={palette.formGroupBg} />
            <rect
              x={0}
              y={chartTop}
              width={plotWidth - rightPad}
              height={chartInnerHeight}
              fill={palette.surface}
            />
            {ticks.map((tickValue) => {
              const y = yFor(tickValue);
              return (
                <line
                  key={`completed-grid-${tickValue}`}
                  x1={0}
                  y1={y}
                  x2={plotWidth - rightPad}
                  y2={y}
                  stroke={tickValue === 0 ? palette.borderHeavy : palette.borderStrong}
                  strokeWidth={tickValue === 0 ? 1.2 : 0.9}
                />
              );
            })}
            {points.map((p, i) => {
              const slotLeft = i * slotWidth;
              const cx = slotLeft + slotWidth / 2;
              const revenueTop = Math.min(yFor(p.revenue), baselineY);
              const revenueBottom = Math.max(yFor(p.revenue), baselineY);
              const expenseTop = Math.min(yFor(-p.expenses), baselineY);
              const expenseBottom = Math.max(yFor(-p.expenses), baselineY);
              return (
                <g key={`completed-${p.label}-${i}`}>
                  <path
                    d={roundedBarPath({
                      x: cx - barWidth / 2,
                      top: revenueTop,
                      bottom: revenueBottom,
                      width: barWidth,
                      radius: 4,
                      roundTop: true,
                    })}
                    fill={palette.success}
                  />
                  <path
                    d={roundedBarPath({
                      x: cx - barWidth / 2,
                      top: expenseTop,
                      bottom: expenseBottom,
                      width: barWidth,
                      radius: 4,
                      roundTop: false,
                    })}
                    fill={palette.brand}
                  />
                  <text
                    x={cx}
                    y={chartHeight - 12}
                    textAnchor="middle"
                    fontSize={fontSize.micro}
                    fontWeight={fontWeight.semibold}
                    fill={palette.textLabel}
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
            <line
              x1={0}
              y1={baselineY}
              x2={plotWidth - rightPad}
              y2={baselineY}
              stroke={palette.borderHeavy}
              strokeWidth={1.2}
            />
            <path d={profitPath} fill="none" stroke="#444B55" strokeWidth={1.6} />
            {points.map((p, i) => {
              const x = i * slotWidth + slotWidth / 2;
              const profitY = yFor(p.profit);
              return (
                <g key={`completed-pt-${p.label}-${i}`}>
                  <circle
                    cx={x}
                    cy={profitY}
                    r={3.4}
                    fill={palette.surface}
                  />
                  <circle
                    cx={x}
                    cy={profitY}
                    r={3.4}
                    fill="none"
                    stroke="#444B55"
                    strokeWidth={1.3}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

export function JournalizingNotStartedTrendChart({
  points,
}: {
  points?: StepTrendPoint[];
}) {
  const labels =
    points != null && points.length > 0
      ? points.map((point) => point.label)
      : Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const chartTop = 10;
  const chartBottom = 32;
  const chartHeight = 240;
  const chartInnerHeight = chartHeight - chartTop - chartBottom;
  const leftAxisWidth = 56;
  const rightPad = 8;
  const slotWidth = 48;
  const plotWidth = labels.length * slotWidth + rightPad;
  const baselineY = chartTop + chartInnerHeight / 2;
  const ticks = [100000, 50000, 0, -50000, -100000];

  return (
    <div
      style={{
        background: palette.formGroupBg,
        borderRadius: 10,
        padding: "12px 14px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: leftAxisWidth,
            textAlign: "right",
            paddingRight: 6,
            fontSize: fontSize.micro,
            color: palette.textLabel,
            fontWeight: fontWeight.semibold,
          }}
        >
          (千円)
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}>
          <LegendChip label="収益" color={palette.success} />
          <LegendChip label="費用" color={palette.brand} />
          <LegendChip label="利益・損失" color="#444B55" line />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <svg width={leftAxisWidth} height={chartHeight}>
          {ticks.map((tickValue) => {
            const y =
              chartTop +
              ((ticks[0]! - tickValue) / (ticks[0]! - ticks[ticks.length - 1]!)) *
                chartInnerHeight;
            return (
              <g key={tickValue}>
                <text
                  x={leftAxisWidth - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={fontSize.micro}
                  fontWeight={fontWeight.semibold}
                  fill={palette.textLabel}
                >
                  {compactYen(tickValue)}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{ overflowX: "auto", flex: 1 }}>
          <svg width={plotWidth} height={chartHeight}>
            <rect x={0} y={0} width={plotWidth} height={chartHeight} fill={palette.formGroupBg} />
            <rect
              x={0}
              y={chartTop}
              width={plotWidth - rightPad}
              height={chartInnerHeight}
              fill={palette.surface}
            />
            {ticks.map((tickValue) => {
              const y =
                chartTop +
                ((ticks[0]! - tickValue) / (ticks[0]! - ticks[ticks.length - 1]!)) *
                  chartInnerHeight;
              return (
                <line
                  key={`not-started-grid-${tickValue}`}
                  x1={0}
                  y1={y}
                  x2={plotWidth - rightPad}
                  y2={y}
                  stroke={tickValue === 0 ? palette.borderHeavy : palette.borderStrong}
                  strokeWidth={tickValue === 0 ? 1.2 : 0.9}
                />
              );
            })}
            {labels.map((label, index) => {
              const cx = index * slotWidth + slotWidth / 2;
              return (
                <g key={`not-started-${label}-${index}`}>
                  <line
                    x1={cx}
                    y1={baselineY - 16}
                    x2={cx}
                    y2={baselineY + 16}
                    stroke={palette.borderSubtle}
                    strokeWidth={8}
                    strokeLinecap="round"
                  />
                  <text
                    x={cx}
                    y={chartHeight - 12}
                    textAnchor="middle"
                    fontSize={fontSize.micro}
                    fontWeight={fontWeight.semibold}
                    fill={palette.textLabel}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            <line
              x1={0}
              y1={baselineY}
              x2={plotWidth - rightPad}
              y2={baselineY}
              stroke={palette.borderHeavy}
              strokeWidth={1.2}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function LegendChip(props: { label: string; color: string; line?: boolean }) {
  return (
    <div
      style={{
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        background: palette.surface,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: fontSize.micro,
        fontWeight: fontWeight.semibold,
        color: palette.textSoft,
      }}
    >
      {props.line ? (
        <span style={{ width: 12, height: 2, borderRadius: 999, background: props.color, display: "inline-block" }} />
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: 999, background: props.color, display: "inline-block" }} />
      )}
      {props.label}
    </div>
  );
}

function compactYen(value: number) {
  return Math.round(value / 1000).toLocaleString("ja-JP");
}

function buildNiceScale(maxAbsValue: number) {
  const roughStep = Math.max(maxAbsValue, 10000) / 2;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  const stepFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = stepFactor * magnitude;
  const maxTick = step * 2;
  return { min: -maxTick, max: maxTick, step };
}

function buildTicks(scale: { min: number; max: number; step: number }) {
  const ticks: number[] = [];
  for (let value = scale.min; value <= scale.max + scale.step * 0.5; value += scale.step) {
    ticks.push(value);
  }
  return ticks.reverse();
}
