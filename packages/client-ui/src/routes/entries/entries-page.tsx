"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import {
  buildVirtualFixedAssetRows,
  buildVirtualOpeningCarryoverRows,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  importEntriesFromCsv,
  importEntriesFromJson,
  buildPeriodLockMessage,
  type EntryRecord,
  type EntryPreviewRow,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkEntries,
  useOpenkkConfig,
  type EntryMasterAccountOption,
} from "@rubydogjp/openkk-client-usecases";
import {
  EntriesScreen,
  VirtualEntryDrawer,
  type EntryFileKind,
  type EntryStatusMessage,
} from "../../entries/entries-ui";
import { EntryEditDrawer } from "../../entries/entry-edit-drawer";

type YearMonthValue = {
  year: number;
  month: number;
};

export function EntriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  // 表示月の初期値は「今日の月」(config.today)。demo/dev は mock 時計、prod は実日付。
  const today = openkkConfig.today;
  const [displayedMonth, setDisplayedMonth] = useState<YearMonthValue>(() =>
    clampMonthToPeriod(
      { year: today.getFullYear(), month: today.getMonth() + 1 },
      currentFiscalPeriod?.startDate ?? null,
      currentFiscalPeriod?.endDate ?? null,
    ),
  );
  const [statusMessage, setStatusMessage] = useState<EntryStatusMessage | null>(
    null,
  );
  const [newEntryDraft, setNewEntryDraft] =
    useState<EntryRecord | null>(null);

  useEffect(() => {
    const monthParam = searchParams.get("month");
    const fromParam = parseMonthParam(monthParam);
    const baseMonth = fromParam ?? {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
    };
    setDisplayedMonth(
      clampMonthToPeriod(
        baseMonth,
        currentFiscalPeriod?.startDate ?? null,
        currentFiscalPeriod?.endDate ?? null,
      ),
    );
  }, [
    currentFiscalPeriod?.endDate,
    currentFiscalPeriod?.id,
    currentFiscalPeriod?.startDate,
    searchParams,
    today,
  ]);

  useEffect(() => {
    if (statusMessage == null) return;
    const timer = setTimeout(() => setStatusMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const periodStartMonth = currentFiscalPeriod
    ? parseYearMonth(currentFiscalPeriod.startDate)
    : null;
  const periodEndMonth = currentFiscalPeriod
    ? parseYearMonth(currentFiscalPeriod.endDate)
    : null;
  const canGoPrev =
    periodStartMonth == null ||
    compareYearMonth(displayedMonth, periodStartMonth) > 0;
  const canGoNext =
    periodEndMonth == null ||
    compareYearMonth(displayedMonth, periodEndMonth) < 0;
  const fiscalPeriodId = appState.currentFiscalPeriodId ?? "";
  const yearMonth = formatYearMonth(displayedMonth);
  const lockedMessage = buildPeriodLockMessage(
    currentFiscalPeriod,
    "仕訳を記録できます",
  );
  const isReadOnlyPeriod =
    currentFiscalPeriod?.stage === "post_closing" ||
    currentFiscalPeriod?.provisionalClosingCompleted === true;
  const screenLockedMessage = isReadOnlyPeriod ? null : lockedMessage;
  const importLockedMessage = buildPeriodLockMessage(
    currentFiscalPeriod,
    "仕訳を取り込めます",
  );
  const canImport = fiscalPeriodId !== "" && importLockedMessage == null;
  const rows =
    fiscalPeriodId === ""
      ? []
      : entriesState.listMonthRows(fiscalPeriodId, yearMonth);
  const virtualRows = useMemo<EntryPreviewRow[]>(() => {
    if (fiscalPeriodId === "") return [];
    return [
      ...buildVirtualOpeningCarryoverRows({
        fiscalPeriodId,
        records: assistState.listOpeningCarryovers(fiscalPeriodId),
        yearMonth,
      }),
      ...buildVirtualFixedAssetRows({
        fiscalPeriodId,
        assets: assistState.listFixedAssets(),
        periodEndDate: currentFiscalPeriod?.endDate ?? null,
        yearMonth,
      }),
    ];
  }, [assistState, currentFiscalPeriod?.endDate, fiscalPeriodId, yearMonth]);
  const tableRows = useMemo(
    () =>
      [...rows, ...virtualRows].sort((left, right) => {
        const dateCompare = left.date.localeCompare(right.date);
        if (dateCompare !== 0) return dateCompare;
        if (left.virtual != null && right.virtual == null) return 1;
        if (left.virtual == null && right.virtual != null) return -1;
        return 0;
      }),
    [rows, virtualRows],
  );
  const fullPeriodEntries =
    fiscalPeriodId === ""
      ? []
      : entriesState.listFiscalPeriodEntries(fiscalPeriodId);

  const drawerEntryId = searchParams.get("entry");
  const drawerVirtualEntryId = searchParams.get("virtualEntry");
  const drawerEntry =
    drawerEntryId == null ? null : entriesState.getEntry(drawerEntryId);
  const drawerVirtualRows =
    drawerVirtualEntryId == null
      ? []
      : tableRows.filter((row) => row.virtual?.id === drawerVirtualEntryId);
  const drawerVirtualEntry = drawerVirtualRows[0] ?? null;

  const navigateWithMonth = useCallback(
    (month: YearMonthValue) => {
      const nextMonth = clampMonthToPeriod(
        month,
        currentFiscalPeriod?.startDate ?? null,
        currentFiscalPeriod?.endDate ?? null,
      );
      setDisplayedMonth(nextMonth);
      setNewEntryDraft(null);
      const next = new URLSearchParams(searchParams.toString());
      next.set("month", formatYearMonth(nextMonth));
      next.delete("entry");
      next.delete("virtualEntry");
      const query = next.toString();
      router.replace(query.length > 0 ? `/entries?${query}` : "/entries", {
        scroll: false,
      });
    },
    [
      currentFiscalPeriod?.endDate,
      currentFiscalPeriod?.startDate,
      router,
      searchParams,
    ],
  );

  const navigateWithEntryParam = useCallback(
    (entryId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("month", yearMonth);
      next.delete("virtualEntry");
      if (entryId == null) {
        next.delete("entry");
      } else {
        next.set("entry", entryId);
      }
      const query = next.toString();
      const url = query.length > 0 ? `/entries?${query}` : "/entries";
      router.replace(url, { scroll: false });
    },
    [router, searchParams, yearMonth],
  );
  const navigateWithVirtualEntryParam = useCallback(
    (virtualEntryId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("month", yearMonth);
      next.delete("entry");
      if (virtualEntryId == null) {
        next.delete("virtualEntry");
      } else {
        next.set("virtualEntry", virtualEntryId);
      }
      const query = next.toString();
      const url = query.length > 0 ? `/entries?${query}` : "/entries";
      router.replace(url, { scroll: false });
    },
    [router, searchParams, yearMonth],
  );

  const openDrawer = useCallback(
    (entryId: string) => {
      setNewEntryDraft(null);
      navigateWithEntryParam(entryId);
    },
    [navigateWithEntryParam],
  );
  const closeDrawer = useCallback(
    () => navigateWithEntryParam(null),
    [navigateWithEntryParam],
  );
  const closeVirtualDrawer = useCallback(
    () => navigateWithVirtualEntryParam(null),
    [navigateWithVirtualEntryParam],
  );
  const closeNewEntryDrawer = useCallback(() => {
    setNewEntryDraft(null);
  }, []);
  const navigateToEntryDateMonth = useCallback(
    (dateText: string) => {
      const entryMonth = parseYearMonth(dateText);
      if (compareYearMonth(entryMonth, displayedMonth) === 0) {
        return false;
      }
      navigateWithMonth(entryMonth);
      return true;
    },
    [displayedMonth, navigateWithMonth],
  );

  const handleImportFile = async (kind: EntryFileKind, file: File) => {
    if (fiscalPeriodId === "") {
      setStatusMessage({ kind: "error", text: "期間が未選択です" });
      return;
    }
    if (!canImport) {
      setStatusMessage({
        kind: "error",
        text: "この期間はロックされており取り込めません",
      });
      return;
    }
    try {
      const text = await file.text();
      const importedEntries =
        kind === "json"
          ? importEntriesFromJson({ text, fiscalPeriodId })
          : importEntriesFromCsv({ text, fiscalPeriodId });
      const result = await entriesState.mergeFiscalPeriodEntries(
        fiscalPeriodId,
        importedEntries,
      );
      // 取り込んだ取引が見えるよう、最も早い取込月へ移動する
      // （既定表示月に取込分が無いと「取り込んだのに何も出ない」状態になるため）。
      const earliestDate = importedEntries
        .map((entry) => entry.date)
        .filter((date): date is string => typeof date === "string" && date.length >= 7)
        .sort((left, right) => left.localeCompare(right))[0];
      if (result.imported > 0 && earliestDate != null) {
        navigateWithMonth(parseYearMonth(earliestDate));
      }
      setStatusMessage({
        kind: "success",
        text: `取り込みました(取込 ${result.imported} 件 / 重複スキップ ${result.skipped} 件)`,
      });
    } catch {
      setStatusMessage({ kind: "error", text: "取り込みに失敗しました" });
    }
  };

  const handleExport = (kind: EntryFileKind) => {
    if (fiscalPeriodId === "") {
      setStatusMessage({ kind: "error", text: "期間が未選択です" });
      return;
    }
    const data =
      kind === "json"
        ? exportEntriesAsJson(fullPeriodEntries)
        : exportEntriesAsCsv(fullPeriodEntries);
    const blob = new Blob([data], {
      type: kind === "json" ? "application/json" : "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const filename = `${fiscalPeriodId}_journal.${kind}`;
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage({ kind: "success", text: `${filename} を出力しました` });
  };

  return (
    <>
      <EntriesScreen
        monthLabel={`${displayedMonth.year}年${displayedMonth.month}月`}
        rows={tableRows}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrev={() => navigateWithMonth(shiftMonth(displayedMonth, -1))}
        onNext={() => navigateWithMonth(shiftMonth(displayedMonth, 1))}
        lockedMessage={screenLockedMessage}
        readOnly={isReadOnlyPeriod}
        statusMessage={statusMessage}
        activeRecordId={
          !isReadOnlyPeriod && drawerEntry != null ? drawerEntry.id : null
        }
        onAddEntry={
          lockedMessage == null && !isReadOnlyPeriod
            ? () => {
                if (fiscalPeriodId === "") return;
                navigateWithEntryParam(null);
                setNewEntryDraft(
                  buildNewEntryDraftRecord(
                    fiscalPeriodId,
                    resolveNewEntryDefaultDate({
                      today: openkkConfig.today,
                      displayedMonth,
                      periodStartDate: currentFiscalPeriod?.startDate ?? null,
                      periodEndDate: currentFiscalPeriod?.endDate ?? null,
                    }),
                    entriesState.accountOptions,
                  ),
                );
              }
            : undefined
        }
        onOpenEntry={
          lockedMessage == null
            ? (row) => {
                if (row.virtual != null) {
                  setNewEntryDraft(null);
                  navigateWithVirtualEntryParam(row.virtual.id);
                  return;
                }
                if (isReadOnlyPeriod) return;
                if (row.recordId == null) return;
                openDrawer(row.recordId);
              }
            : undefined
        }
        onImportFile={canImport ? handleImportFile : undefined}
        onExport={fiscalPeriodId !== "" ? handleExport : undefined}
      />
      {drawerEntry != null &&
      newEntryDraft == null &&
      lockedMessage == null &&
      !isReadOnlyPeriod ? (
        <EntryEditDrawer
          entry={drawerEntry}
          accountOptions={entriesState.accountOptions}
          taxCategoryOptions={entriesState.taxCategoryOptions}
          businessCategoryOptions={entriesState.businessCategoryOptions}
          suggestions={entriesState.listSuggestions(fiscalPeriodId)}
          onClose={closeDrawer}
          onSave={async (draft) => {
            const ok = await entriesState.saveEntry(drawerEntry.id, draft);
            if (ok) {
              if (!navigateToEntryDateMonth(draft.date)) {
                closeDrawer();
              }
            } else {
              throw new Error("saveEntry returned false");
            }
          }}
          onDelete={async () => {
            const ok = await entriesState.deleteEntry(drawerEntry.id);
            if (ok) {
              closeDrawer();
            } else {
              throw new Error("deleteEntry returned false");
            }
          }}
        />
      ) : null}
      {newEntryDraft != null && lockedMessage == null && !isReadOnlyPeriod ? (
        <EntryEditDrawer
          mode="create"
          entry={newEntryDraft}
          accountOptions={entriesState.accountOptions}
          taxCategoryOptions={entriesState.taxCategoryOptions}
          businessCategoryOptions={entriesState.businessCategoryOptions}
          suggestions={entriesState.listSuggestions(fiscalPeriodId)}
          onClose={closeNewEntryDrawer}
          onSave={async (draft) => {
            const createdId = await entriesState.createEntryFromDraft(
              fiscalPeriodId,
              draft,
            );
            if (createdId != null) {
              if (!navigateToEntryDateMonth(draft.date)) {
                closeNewEntryDrawer();
              }
            } else {
              throw new Error("createEntryFromDraft returned null");
            }
          }}
        />
      ) : null}
      {drawerVirtualEntry != null && lockedMessage == null ? (
        <VirtualEntryDrawer
          row={drawerVirtualEntry}
          rows={drawerVirtualRows}
          onClose={closeVirtualDrawer}
          onOpenAssist={(href) => router.push(href)}
        />
      ) : null}
    </>
  );
}

function parseYearMonth(dateText: string): YearMonthValue {
  const [yearText, monthText] = dateText.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
  };
}

function compareYearMonth(left: YearMonthValue, right: YearMonthValue): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  return left.month - right.month;
}

function clampMonthToPeriod(
  month: YearMonthValue,
  startDate: string | null,
  endDate: string | null,
): YearMonthValue {
  const startMonth = startDate == null ? null : parseYearMonth(startDate);
  const endMonth = endDate == null ? null : parseYearMonth(endDate);

  if (startMonth != null && compareYearMonth(month, startMonth) < 0) {
    return startMonth;
  }
  if (endMonth != null && compareYearMonth(month, endMonth) > 0) {
    return endMonth;
  }
  return month;
}

function shiftMonth(month: YearMonthValue, offset: number): YearMonthValue {
  const nextDate = new Date(month.year, month.month - 1 + offset, 1);
  return {
    year: nextDate.getFullYear(),
    month: nextDate.getMonth() + 1,
  };
}

function formatYearMonth(month: YearMonthValue): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function buildNewEntryDraftRecord(
  fiscalPeriodId: string,
  defaultDate: string,
  accountOptions: EntryMasterAccountOption[],
): EntryRecord {
  const debit =
    accountOptions.find((account) => account.name === "仮払金") ??
    accountOptions.find((account) => account.accountType === "expense") ??
    accountOptions[0];
  const credit =
    accountOptions.find((account) => account.name === "普通預金") ??
    accountOptions.find((account) => account.accountType === "asset") ??
    accountOptions[0];
  const date = defaultDate;
  return {
    id: "__new_entry__",
    fiscalPeriodId,
    date,
    weekday: weekdayJa(date),
    lines: [
      {
        side: "debit",
        accountName: debit?.name ?? "",
        accountType: debit?.accountType ?? "expense",
        amount: "",
        bookAccountId: debit?.id,
      },
      {
        side: "credit",
        accountName: credit?.name ?? "",
        accountType: credit?.accountType ?? "asset",
        amount: "",
        bookAccountId: credit?.id,
      },
    ],
    debit: debit?.name ?? "",
    debitType: debit?.accountType ?? "expense",
    debitAmount: "",
    credit: credit?.name ?? "",
    creditType: credit?.accountType ?? "asset",
    creditAmount: "",
    description: "",
    partner: "",
    businessRate: "",
    taxCategory: "対象外",
    businessCategory: "",
  };
}

function resolveNewEntryDefaultDate(input: {
  today: Date;
  displayedMonth: YearMonthValue;
  periodStartDate: string | null;
  periodEndDate: string | null;
}): string {
  const todayText = formatLocalDate(input.today);
  if (
    input.periodStartDate != null &&
    input.periodEndDate != null &&
    isDateWithinRange(todayText, input.periodStartDate, input.periodEndDate)
  ) {
    return todayText;
  }

  const displayedMonthFirstDate = `${formatYearMonth(input.displayedMonth)}-01`;
  if (
    input.periodStartDate != null &&
    input.periodEndDate != null &&
    isDateWithinRange(
      displayedMonthFirstDate,
      input.periodStartDate,
      input.periodEndDate,
    )
  ) {
    return displayedMonthFirstDate;
  }

  return input.periodStartDate ?? displayedMonthFirstDate;
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function isDateWithinRange(
  dateText: string,
  startDate: string | null,
  endDate: string | null,
): boolean {
  if (startDate != null && dateText < startDate) return false;
  if (endDate != null && dateText > endDate) return false;
  return true;
}

function weekdayJa(dateText: string): string {
  const date = new Date(dateText);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return weekdays[date.getDay()] ?? "";
}

function parseMonthParam(value: string | null): YearMonthValue | null {
  if (value == null) return null;
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  if (matched == null) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}
