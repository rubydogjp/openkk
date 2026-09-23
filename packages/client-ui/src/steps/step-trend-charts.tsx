"use client";

import Link from "next/link.js";
import { useEffect, useRef, useState } from "react";

import type { StepTrendPoint } from "@rubydogjp/openkk-client-domain";
import { fontSize, fontWeight, palette } from "../shared/design-tokens.js";
import { useReportWorkInProgress } from "../shared/work-in-progress.js";

const chartGeometry = {
  top: 10,
  bottom: 32,
  height: 240,
  axisWidth: 56,
  rightPadding: 8,
  minimumSlotWidth: 48,
} as const;
const revenueLight = "rgba(21, 128, 61, 0.32)";
const expenseLight = "rgba(37, 99, 235, 0.32)";
const profitColor = "#444B55";

type TrendChartMode = "current" | "completed" | "not-started";

export function JournalizingCurrentTrendChart(props: {
  points: StepTrendPoint[];
  detailsHref: string | null;
}) {
  return (
    <TrendChart
      points={props.points}
      mode="current"
      detailsHref={props.detailsHref}
    />
  );
}

export function JournalizingCompletedTrendChart(props: {
  points: StepTrendPoint[];
}) {
  return <TrendChart points={props.points} mode="completed" detailsHref={null} />;
}

export function JournalizingNotStartedTrendChart(props: {
  points: StepTrendPoint[] | null;
}) {
  const points =
    props.points != null && props.points.length > 0
      ? props.points
      : Array.from({ length: 12 }, (_, index) => ({
          label: `${index + 1}月`,
          revenue: 0,
          expenses: 0,
          profit: 0,
          isCurrent: false,
        }));
  return <TrendChart points={points} mode="not-started" detailsHref={null} />;
}

function TrendChart(props: {
  points: StepTrendPoint[];
  mode: TrendChartMode;
  detailsHref: string | null;
}) {
  const scale =
    props.mode === "not-started"
      ? { min: -100000, max: 100000, step: 50000 }
      : buildNiceScale(
          Math.max(
            1,
            ...props.points.map((point) =>
              Math.max(
                Math.abs(point.revenue),
                Math.abs(point.expenses),
                Math.abs(point.profit),
              ),
            ),
          ),
        );
  const ticks = buildTicks(scale);
  const range = scale.max - scale.min;
  const innerHeight =
    chartGeometry.height - chartGeometry.top - chartGeometry.bottom;
  const yFor = (value: number) =>
    chartGeometry.top + ((scale.max - value) / range) * innerHeight;
  const baselineY = yFor(0);
  const { plotContainerRef, slotWidth, plotWidth } = usePlotDimensions(
    props.points.length,
  );
  const barWidth = Math.min(20, slotWidth * 0.38);
  const profitPath = props.points
    .map((point, index) => {
      const x = index * slotWidth + slotWidth / 2;
      return `${index === 0 ? "M" : "L"} ${x} ${yFor(point.profit)}`;
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
      <TrendLegend />
      <div style={{ display: "flex", alignItems: "stretch", minWidth: 0 }}>
        <TrendAxis ticks={ticks} yFor={yFor} />
        <div
          ref={plotContainerRef}
          style={{
            overflowX: "auto",
            flex: "1 1 0",
            width: 0,
            minWidth: 0,
          }}
        >
          <svg
            width={plotWidth}
            height={chartGeometry.height}
            role="img"
            aria-label="収益・費用・利益の推移"
          >
            <rect
              x={0}
              y={chartGeometry.top}
              width={plotWidth - chartGeometry.rightPadding}
              height={innerHeight}
              fill={palette.surface}
            />
            <TrendGrid
              ticks={ticks}
              yFor={yFor}
              plotWidth={plotWidth}
            />
            {props.mode === "not-started" ? (
              <EmptyTrendMarks
                points={props.points}
                slotWidth={slotWidth}
                baselineY={baselineY}
              />
            ) : (
              <>
                <TrendBars
                  points={props.points}
                  mode={props.mode}
                  slotWidth={slotWidth}
                  barWidth={barWidth}
                  baselineY={baselineY}
                  yFor={yFor}
                />
                <path
                  d={profitPath}
                  fill="none"
                  stroke={profitColor}
                  strokeWidth={1.6}
                />
                <ProfitPoints
                  points={props.points}
                  mode={props.mode}
                  slotWidth={slotWidth}
                  yFor={yFor}
                />
              </>
            )}
            <line
              x1={0}
              y1={baselineY}
              x2={plotWidth - chartGeometry.rightPadding}
              y2={baselineY}
              stroke={palette.borderHeavy}
              strokeWidth={1.2}
            />
          </svg>
        </div>
      </div>
      {props.detailsHref != null ? (
        <TrendDetailsLink href={props.detailsHref} />
      ) : null}
    </div>
  );
}

function usePlotDimensions(pointCount: number) {
  const plotContainerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  useReportWorkInProgress(availableWidth == null);

  useEffect(() => {
    const element = plotContainerRef.current;
    if (element == null) return;
    const updateWidth = (width: number) => {
      const roundedWidth = Math.floor(width);
      setAvailableWidth((current) =>
        current === roundedWidth ? current : roundedWidth,
      );
    };
    updateWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width != null) updateWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const slotWidth =
    availableWidth == null
      ? chartGeometry.minimumSlotWidth
      : Math.max(
          chartGeometry.minimumSlotWidth,
          Math.floor(
            (availableWidth - chartGeometry.rightPadding) /
              Math.max(pointCount, 1),
          ),
        );
  return {
    plotContainerRef,
    slotWidth,
    plotWidth: pointCount * slotWidth + chartGeometry.rightPadding,
  };
}

function TrendLegend() {
  return (
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
          width: chartGeometry.axisWidth,
          textAlign: "right",
          paddingRight: 6,
          fontSize: fontSize.micro,
          color: palette.textLabel,
          fontWeight: fontWeight.semibold,
        }}
      >
        (千円)
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          flex: 1,
        }}
      >
        <LegendChip label="収益" color={palette.success} line={false} />
        <LegendChip label="費用" color={palette.brand} line={false} />
        <LegendChip label="利益・損失" color={profitColor} line />
      </div>
    </div>
  );
}

function TrendAxis(props: {
  ticks: number[];
  yFor: (value: number) => number;
}) {
  return (
    <svg
      width={chartGeometry.axisWidth}
      height={chartGeometry.height}
      style={{ flex: "0 0 auto" }}
      aria-hidden="true"
    >
      {props.ticks.map((tick) => (
        <text
          key={tick}
          x={chartGeometry.axisWidth - 6}
          y={props.yFor(tick) + 3}
          textAnchor="end"
          fontSize={fontSize.micro}
          fontWeight={fontWeight.semibold}
          fill={palette.textLabel}
        >
          {compactYen(tick)}
        </text>
      ))}
    </svg>
  );
}

function TrendGrid(props: {
  ticks: number[];
  yFor: (value: number) => number;
  plotWidth: number;
}) {
  return props.ticks.map((tick) => (
    <line
      key={tick}
      x1={0}
      y1={props.yFor(tick)}
      x2={props.plotWidth - chartGeometry.rightPadding}
      y2={props.yFor(tick)}
      stroke={tick === 0 ? palette.borderHeavy : palette.borderStrong}
      strokeWidth={tick === 0 ? 1.2 : 0.9}
    />
  ));
}

function TrendBars(props: {
  points: StepTrendPoint[];
  mode: Exclude<TrendChartMode, "not-started">;
  slotWidth: number;
  barWidth: number;
  baselineY: number;
  yFor: (value: number) => number;
}) {
  return props.points.map((point, index) => {
    const x = index * props.slotWidth + props.slotWidth / 2;
    const revenueValue = point.revenue;
    const expenseValue = -point.expenses;
    const revenueY = props.yFor(revenueValue);
    const expenseY = props.yFor(expenseValue);
    const current = props.mode === "completed" || point.isCurrent;
    return (
      <g key={`${point.label}-${index}`}>
        <path
          d={roundedBarPath({
            x: x - props.barWidth / 2,
            top: Math.min(revenueY, props.baselineY),
            bottom: Math.max(revenueY, props.baselineY),
            width: props.barWidth,
            radius: 4,
            roundTop: revenueValue >= 0,
          })}
          fill={current ? palette.success : revenueLight}
        />
        <path
          d={roundedBarPath({
            x: x - props.barWidth / 2,
            top: Math.min(expenseY, props.baselineY),
            bottom: Math.max(expenseY, props.baselineY),
            width: props.barWidth,
            radius: 4,
            roundTop: expenseValue >= 0,
          })}
          fill={current ? palette.brand : expenseLight}
        />
        <TrendLabel label={point.label} x={x} />
      </g>
    );
  });
}

function EmptyTrendMarks(props: {
  points: StepTrendPoint[];
  slotWidth: number;
  baselineY: number;
}) {
  return props.points.map((point, index) => {
    const x = index * props.slotWidth + props.slotWidth / 2;
    return (
      <g key={`${point.label}-${index}`}>
        <line
          x1={x}
          y1={props.baselineY - 16}
          x2={x}
          y2={props.baselineY + 16}
          stroke={palette.borderSubtle}
          strokeWidth={8}
          strokeLinecap="round"
        />
        <TrendLabel label={point.label} x={x} />
      </g>
    );
  });
}

function TrendLabel(props: { label: string; x: number }) {
  return (
    <text
      x={props.x}
      y={chartGeometry.height - 12}
      textAnchor="middle"
      fontSize={fontSize.micro}
      fontWeight={fontWeight.semibold}
      fill={palette.textLabel}
    >
      {props.label}
    </text>
  );
}

function ProfitPoints(props: {
  points: StepTrendPoint[];
  mode: Exclude<TrendChartMode, "not-started">;
  slotWidth: number;
  yFor: (value: number) => number;
}) {
  return props.points.map((point, index) => {
    const x = index * props.slotWidth + props.slotWidth / 2;
    const y = props.yFor(point.profit);
    const emphasized = props.mode === "current" && point.isCurrent;
    const radius = emphasized ? 4.2 : 3.4;
    return (
      <g key={`${point.label}-${index}`}>
        <circle cx={x} cy={y} r={radius} fill={palette.surface} />
        <circle
          cx={x}
          cy={y}
          r={radius}
          fill="none"
          stroke={profitColor}
          strokeWidth={1.3}
        />
        {emphasized ? (
          <circle cx={x} cy={y} r={1.9} fill={profitColor} />
        ) : null}
      </g>
    );
  });
}

function TrendDetailsLink(props: { href: string }) {
  return (
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
        href={props.href}
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
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
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
  );
}

function LegendChip(props: {
  label: string;
  color: string;
  line: boolean;
}) {
  const markerStyle = props.line
    ? { width: 12, height: 2 }
    : { width: 8, height: 8 };
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
      <span
        style={{
          ...markerStyle,
          borderRadius: 999,
          background: props.color,
          display: "inline-block",
        }}
      />
      {props.label}
    </div>
  );
}

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
  const radius = Math.max(
    0,
    Math.min(input.radius, (input.bottom - input.top) / 2, input.width / 2),
  );
  if (input.roundTop) {
    return [
      `M ${left} ${input.bottom}`,
      `L ${left} ${input.top + radius}`,
      `Q ${left} ${input.top} ${left + radius} ${input.top}`,
      `L ${right - radius} ${input.top}`,
      `Q ${right} ${input.top} ${right} ${input.top + radius}`,
      `L ${right} ${input.bottom}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${left} ${input.top}`,
    `L ${left} ${input.bottom - radius}`,
    `Q ${left} ${input.bottom} ${left + radius} ${input.bottom}`,
    `L ${right - radius} ${input.bottom}`,
    `Q ${right} ${input.bottom} ${right} ${input.bottom - radius}`,
    `L ${right} ${input.top}`,
    "Z",
  ].join(" ");
}

function compactYen(value: number) {
  return Math.round(value / 1000).toLocaleString("ja-JP");
}

function buildNiceScale(maximumAbsoluteValue: number) {
  const roughStep = Math.max(maximumAbsoluteValue, 10000) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const stepFactor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = stepFactor * magnitude;
  return { min: -step * 2, max: step * 2, step };
}

function buildTicks(scale: { min: number; max: number; step: number }) {
  const ticks: number[] = [];
  for (
    let value = scale.min;
    value <= scale.max + scale.step * 0.5;
    value += scale.step
  ) {
    ticks.push(value);
  }
  return ticks.reverse();
}
