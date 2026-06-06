"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  useOpenkkAppState,
  useOpenkkEntries,
  useOpenkkConfig,
} from "@rubydogjp/openkk-client-usecases";
import {
  computeExpenseContribution,
  computeRevenueContribution,
  parseBusinessRate,
  buildYearMonthRange,
  compareYearMonth,
  parseYearMonth,
} from "@rubydogjp/openkk-client-domain";
import {
  fontSize,
  fontWeight,
  palette,
  sizes,
  typography,
} from "../../../../shared/design-tokens";
import { PlBsDiagramSection } from "../../../../shared/pl-bs-diagram";

type MonthTile = {
  year: number;
  month: number;
  key: string;
  revenue: number;
  expenses: number;
  profit: number;
  transactionCount: number;
  enabled: boolean;
};

export function JournalizingAnalyticsPage() {
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const openkkConfig = useOpenkkConfig();
  const [expandedMonths, setExpandedMonths] = useState<number[]>([]);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  const monthTiles = useMemo<MonthTile[]>(() => {
    if (currentFiscalPeriod == null) return [];
    const startMonth = parseYearMonth(currentFiscalPeriod.startDate);
    const endMonth = parseYearMonth(currentFiscalPeriod.endDate);
    const months = buildYearMonthRange(startMonth, endMonth);
    const currentMonth = {
      year: openkkConfig.today.getFullYear(),
      month: openkkConfig.today.getMonth() + 1,
    };
    return months.map((yearMonth) => {
      const monthKey = yearMonth.key;
      const monthRecords = entriesState.listMonthEntries(
        currentFiscalPeriod.id,
        monthKey,
      );
      let revenue = 0;
      let expenses = 0;
      for (const record of monthRecords) {
        const rate = parseBusinessRate(record.businessRate);
        revenue += computeRevenueContribution(record, rate);
        expenses += computeExpenseContribution(record, rate);
      }
      return {
        year: yearMonth.year,
        month: yearMonth.month,
        key: monthKey,
        revenue,
        expenses,
        profit: revenue - expenses,
        transactionCount: monthRecords.length,
        enabled:
          currentFiscalPeriod.phase === "post_closing" ||
          compareYearMonth(yearMonth, currentMonth) <= 0,
      };
    });
  }, [currentFiscalPeriod, entriesState]);

  return (
    <section style={{ padding: "24px 24px 96px" }}>
      <div
        style={{ maxWidth: sizes.content.readingMaxWidth, margin: "0 auto" }}
      >
        <Link
          href="/steps/journalizing"
          style={{
            fontSize: fontSize.sm,
            color: palette.textSoft,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← 仕訳の手順に戻る
        </Link>

        <div style={{ marginTop: 14 }}>
          <h1
            style={{
              margin: 0,
              fontSize: typography.dialogTitle.fontSize,
              fontWeight: fontWeight.bold,
              color: palette.text,
              letterSpacing: "-0.01em",
            }}
          >
            記録中
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: fontSize.base,
              lineHeight: 1.7,
              color: palette.textSoft,
            }}
          >
            {currentFiscalPeriod != null
              ? `${currentFiscalPeriod.name} の月別の収益・費用・利益を確認できます。`
              : "期間を選択してください。"}
          </p>
        </div>

        {currentFiscalPeriod ==
        null ? null : !currentFiscalPeriod.openingBalancesCompleted ? (
          <div
            style={{
              marginTop: 24,
              borderRadius: 12,
              border: `1px solid ${palette.borderSubtle}`,
              background: palette.surface,
              padding: 24,
            }}
          >
            <div
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.bold,
                color: palette.text,
              }}
            >
              先に期首のBSを入力してください
            </div>
            <div
              style={{
                marginTop: 10,
                color: palette.textSoft,
                lineHeight: 1.7,
                fontSize: fontSize.base,
              }}
            >
              期首残高の入力が終わると、月別の進捗が表示されます。
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
            {monthTiles.map((tile) => {
              const expanded = expandedMonths.includes(tile.month);
              return (
                <div
                  key={tile.key}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${palette.borderSubtle}`,
                    background: tile.enabled ? palette.surface : palette.pageBg,
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    disabled={!tile.enabled}
                    onClick={() => {
                      setExpandedMonths((current) =>
                        current.includes(tile.month)
                          ? current.filter((v) => v !== tile.month)
                          : [...current, tile.month],
                      );
                    }}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      border: "none",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: tile.enabled ? "pointer" : "default",
                      color: tile.enabled ? palette.text : palette.textMuted,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: fontSize.lg,
                          fontWeight: fontWeight.bold,
                        }}
                      >
                        {tile.month}月
                      </span>
                      {tile.transactionCount > 0 ? (
                        <span
                          style={{
                            height: 20,
                            padding: "0 8px",
                            borderRadius: 10,
                            background: palette.brandTint,
                            color: palette.brand,
                            fontSize: fontSize.xs,
                            fontWeight: fontWeight.bold,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {tile.transactionCount}件
                        </span>
                      ) : null}
                    </div>
                    <span
                      style={{
                        fontSize: typography.dialogTitle.fontSize,
                        lineHeight: 1,
                      }}
                    >
                      {expanded ? "⌃" : "⌄"}
                    </span>
                  </button>
                  {expanded && tile.enabled ? (
                    <>
                      <div
                        style={{
                          height: 1,
                          background: palette.borderSubtle,
                        }}
                      />
                      <div style={{ padding: "14px 16px" }}>
                        <PlBsDiagramSection
                          pl={{
                            revenue: tile.revenue,
                            expenses: tile.expenses,
                            profit: tile.profit,
                          }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
