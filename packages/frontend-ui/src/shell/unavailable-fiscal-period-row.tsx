"use client";

import type { OpenkkFiscalPeriodLabel } from "@rubydogjp/openkk-driver";

import {
  fontSize,
  fontWeight,
  palette,
  radii,
} from "../shared/design-tokens.js";

export const UNNAMED_FISCAL_PERIOD_NAME = "名前の分からない期間";

function fiscalPeriodLabelDates(
  period: OpenkkFiscalPeriodLabel,
): string | null {
  return period.startDate == null || period.endDate == null
    ? null
    : `${period.startDate} 〜 ${period.endDate}`;
}

export function UnavailableFiscalPeriodRow(props: {
  period: OpenkkFiscalPeriodLabel;
  reason: string;
  showDivider: boolean;
}) {
  const { period } = props;
  const dates = fiscalPeriodLabelDates(period);
  return (
    <div
      className="bk-fiscal-period-row"
      aria-disabled="true"
      style={{
        borderTop: props.showDivider ? `1px solid ${palette.hairline}` : "none",
        background: palette.surface,
        padding: "14px 16px",
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        cursor: "default",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: palette.textLabel,
            lineHeight: 1.4,
          }}
        >
          {period.name ?? UNNAMED_FISCAL_PERIOD_NAME}
        </div>
        {dates != null ? (
          <div
            style={{
              marginTop: 4,
              fontSize: fontSize.sm,
              color: palette.textLabel,
            }}
          >
            {dates}
          </div>
        ) : null}
      </div>
      <span
        style={{
          flexShrink: 0,
          height: 22,
          padding: "0 10px",
          borderRadius: radii.pill,
          background: palette.warningBg,
          color: palette.warningText,
          display: "inline-flex",
          alignItems: "center",
          fontSize: fontSize.xs,
          fontWeight: fontWeight.bold,
        }}
      >
        {props.reason}
      </span>
    </div>
  );
}
