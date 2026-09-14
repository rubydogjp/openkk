"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation.js";

import {
  AppError,
  assertEntryImportSize,
  buildVirtualBusinessRateTransferRows,
  buildVirtualFixedAssetRows,
  buildVirtualOpeningCarryoverRows,
  decodeJournalImportBytes,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  importEntriesFromCsv,
  importEntriesFromJson,
  buildPeriodLockMessage,
  formatIsoLocalDate,
  resolveEditingPolicy,
  type EntryPreviewRow,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkEntries,
  useOpenkkConfig,
  useOpenkkToday,
  type EntryDraft,
  type EntryMasterAccountOption,
} from "@rubydogjp/openkk-client-usecases";
import {
  EntriesScreen,
  VirtualEntryDrawer,
  type EntryFileKind,
  type EntryStatusMessage,
} from "../../entries/entries-ui.js";
import { EntryEditDrawer } from "../../entries/entry-edit-drawer.js";
import { entryRecordToDraft } from "../../entries/entry-edit-model.js";
import { downloadBytes } from "../../shared/download.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";

type YearMonthValue = {
  year: number;
  month: number;
};

export function EntriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appState = useOpenkkAppState();
  const openkkConfig = useOpenkkConfig();
  const today = useOpenkkToday();
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const editingLocked = resolveEditingPolicy(openkkConfig).locked;
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const fiscalPeriodId = appState.currentFiscalPeriodId;
  const [displayedMonth, setDisplayedMonth] = useState<YearMonthValue>(() =>
    clampMonthToPeriod(
      {
        year: today.getFullYear(),
        month: today.getMonth() + 1,
      },
      currentFiscalPeriod?.startDate ?? null,
      currentFiscalPeriod?.endDate ?? null,
    ),
  );
  const [statusMessage, setStatusMessage] = useState<EntryStatusMessage | null>(
    null,
  );
  const [newEntryDraft, setNewEntryDraft] = useState<EntryDraft | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importLock = useRef(new ExclusiveActionLock());
  const selectedFiscalPeriodId = useRef(fiscalPeriodId);
  selectedFiscalPeriodId.current = fiscalPeriodId;

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
    setNewEntryDraft(null);
  }, [fiscalPeriodId]);

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
  const yearMonth = formatYearMonth(displayedMonth);
  const lockedMessage = buildPeriodLockMessage(
    currentFiscalPeriod ?? null,
    "仕訳を記録できます",
  );
  const isReadOnlyPeriod =
    currentFiscalPeriod?.phase === "post_closing" ||
    currentFiscalPeriod?.phase === "pre_closing";
  const screenLockedMessage = isReadOnlyPeriod ? null : lockedMessage;
  const importLockedMessage = buildPeriodLockMessage(
    currentFiscalPeriod ?? null,
    "仕訳を取り込めます",
  );
  const canImport =
    fiscalPeriodId != null && importLockedMessage == null && !editingLocked;
  const rows =
    fiscalPeriodId == null
      ? []
      : entriesState.listMonthRows(fiscalPeriodId, yearMonth);
  const fullPeriodEntries =
    fiscalPeriodId == null
      ? []
      : entriesState.listFiscalPeriodEntries(fiscalPeriodId);
  const virtualRows = useMemo<EntryPreviewRow[]>(() => {
    if (fiscalPeriodId == null) return [];
    const materializedLocalIds = new Set(
      fullPeriodEntries
        .map((entry) => entry.localId)
        .filter(
          (localId): localId is string => localId != null,
        ),
    );
    const realEntries = fullPeriodEntries.filter(
      (entry) => entry.localId == null || !entry.localId.startsWith("virtual:"),
    );
    return [
      ...buildVirtualOpeningCarryoverRows({
        fiscalPeriodId,
        records: assistState.listOpeningCarryovers(fiscalPeriodId),
        yearMonth,
      }),
      ...buildVirtualFixedAssetRows({
        fiscalPeriodId,
        assets: assistState.listFixedAssets(fiscalPeriodId),
        periodStartDate: currentFiscalPeriod?.startDate ?? null,
        periodEndDate: currentFiscalPeriod?.endDate ?? null,
        yearMonth,
      }),
      ...buildVirtualBusinessRateTransferRows({
        fiscalPeriodId,
        periodStartDate: currentFiscalPeriod?.startDate ?? null,
        periodEndDate: currentFiscalPeriod?.endDate ?? null,
        entries: realEntries,
        assets: assistState.listFixedAssets(fiscalPeriodId),
        carryovers: assistState.listOpeningCarryovers(fiscalPeriodId),
        yearMonth,
      }),
    ].filter(
      (row) => !materializedLocalIds.has(`virtual:${row.recordId}`),
    );
  }, [
    assistState,
    currentFiscalPeriod?.startDate,
    currentFiscalPeriod?.endDate,
    fiscalPeriodId,
    fullPeriodEntries,
    yearMonth,
  ]);
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
  const drawerEntryId = searchParams.get("entry");
  const drawerVirtualEntryId = searchParams.get("virtualEntry");
  const candidateDrawerEntry =
    drawerEntryId == null ? null : entriesState.getEntry(drawerEntryId);
  const drawerEntry =
    candidateDrawerEntry?.fiscalPeriodId === fiscalPeriodId
      ? candidateDrawerEntry
      : null;
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
    if (fiscalPeriodId == null) {
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
    const release = importLock.current.tryAcquire();
    if (release == null) return;
    setIsImporting(true);
    try {
      assertEntryImportSize(file.size);
      const text = decodeJournalImportBytes(
        new Uint8Array(await file.arrayBuffer()),
      );
      const importedEntries =
        kind === "json"
          ? importEntriesFromJson({ text, fiscalPeriodId })
          : importEntriesFromCsv({ text, fiscalPeriodId });
      if (selectedFiscalPeriodId.current !== fiscalPeriodId) {
        throw new AppError({
          messageForDeveloper: "entries: fiscal period changed during import",
          messageForUser:
            "取込中に会計期間が切り替わったため、データは保存しませんでした",
          originalMessage: null,
          statusCode: null,
          code: null,
        });
      }
      const result = await entriesState.mergeFiscalPeriodEntries(
        fiscalPeriodId,
        importedEntries,
      );
      if (selectedFiscalPeriodId.current !== fiscalPeriodId) return;
      const earliestDate = result.earliestImportedDate;
      if (result.imported > 0 && earliestDate != null) {
        navigateWithMonth(parseYearMonth(earliestDate));
      }
      setStatusMessage({
        kind: "success",
        text: `取り込みました(取込 ${result.imported} 件 / 重複スキップ ${result.skipped} 件)`,
      });
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: AppError.from(error, {
          fallbackUserMessage: "取り込みに失敗しました",
          fallbackDeveloperMessage: "entries: import file failed",
          statusCode: null,
        }).messageForUser,
      });
    } finally {
      setIsImporting(false);
      release();
    }
  };

  const handleExport = (kind: EntryFileKind) => {
    if (fiscalPeriodId == null) {
      setStatusMessage({ kind: "error", text: "期間が未選択です" });
      return;
    }
    const manualEntriesForFileExport = fullPeriodEntries.filter(
      (entry) => !entry.localId?.startsWith("virtual:"),
    );
    const data =
      kind === "json"
        ? exportEntriesAsJson(manualEntriesForFileExport)
        : `\uFEFF${exportEntriesAsCsv(manualEntriesForFileExport)}`;
    const filename = `${fiscalPeriodId}_journal.${kind}`;
    downloadBytes(
      new TextEncoder().encode(data),
      filename,
      kind === "json"
        ? "application/json;charset=utf-8"
        : "text/csv;charset=utf-8",
    );
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
        readOnly={isReadOnlyPeriod || editingLocked}
        statusMessage={statusMessage}
        activeRecordId={
          !isReadOnlyPeriod && !editingLocked && drawerEntry != null
            ? drawerEntry.id
            : null
        }
        onAddEntry={
          lockedMessage == null && !isReadOnlyPeriod && !editingLocked
            ? () => {
                if (fiscalPeriodId == null) return;
                navigateWithEntryParam(null);
                setNewEntryDraft(
                  buildNewEntryDraft(
                    resolveNewEntryDefaultDate({
                      today,
                      displayedMonth,
                      periodStartDate: currentFiscalPeriod?.startDate ?? null,
                      periodEndDate: currentFiscalPeriod?.endDate ?? null,
                    }),
                    entriesState.accountOptions,
                  ),
                );
              }
            : null
        }
        onOpenEntry={
          lockedMessage == null && !editingLocked
            ? (row) => {
                if (row.virtual != null) {
                  setNewEntryDraft(null);
                  navigateWithVirtualEntryParam(row.virtual.id);
                  return;
                }
                if (isReadOnlyPeriod) return;
                openDrawer(row.recordId);
              }
            : null
        }
        onImportFile={canImport && !isImporting ? handleImportFile : null}
        onExport={fiscalPeriodId != null ? handleExport : null}
        isPlaceholderData={false}
      />
      {fiscalPeriodId != null &&
      drawerEntry != null &&
      newEntryDraft == null &&
      lockedMessage == null &&
      !isReadOnlyPeriod &&
      !editingLocked ? (
        <EntryEditDrawer
          key={`edit:${drawerEntry.id}`}
          entry={entryRecordToDraft(drawerEntry)}
          minDate={currentFiscalPeriod?.startDate ?? null}
          maxDate={currentFiscalPeriod?.endDate ?? null}
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
              throw new AppError({
                messageForDeveloper: "saveEntry returned false",
                messageForUser: "仕訳の保存に失敗しました",
                originalMessage: null,
                statusCode: null,
                code: null,
              });
            }
          }}
          onDelete={async () => {
            const ok = await entriesState.deleteEntry(drawerEntry.id);
            if (ok) {
              closeDrawer();
            } else {
              throw new AppError({
                messageForDeveloper: "deleteEntry returned false",
                messageForUser: "仕訳の削除に失敗しました",
                originalMessage: null,
                statusCode: null,
                code: null,
              });
            }
          }}
          mode="edit"
        />
      ) : null}
      {fiscalPeriodId != null &&
      newEntryDraft != null &&
      lockedMessage == null &&
      !isReadOnlyPeriod &&
      !editingLocked ? (
        <EntryEditDrawer
          key="create"
          mode="create"
          entry={newEntryDraft}
          minDate={currentFiscalPeriod?.startDate ?? null}
          maxDate={currentFiscalPeriod?.endDate ?? null}
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
              throw new AppError({
                messageForDeveloper: "createEntryFromDraft returned null",
                messageForUser: "仕訳の作成に失敗しました",
                originalMessage: null,
                statusCode: null,
                code: null,
              });
            }
          }}
          onDelete={null}
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

function buildNewEntryDraft(
  defaultDate: string,
  accountOptions: EntryMasterAccountOption[],
): EntryDraft {
  const debit =
    accountOptions.find((account) => account.name === "仮払金") ??
    accountOptions.find((account) => account.accountType === "expense") ??
    accountOptions[0];
  const credit =
    accountOptions.find((account) => account.name === "普通預金") ??
    accountOptions.find((account) => account.accountType === "asset") ??
    accountOptions[0];
  return {
    date: defaultDate,
    lines: [
      {
        side: "debit",
        accountName: debit?.name ?? "",
        accountType: debit?.accountType ?? "expense",
        amount: "",
        bookAccountId: debit?.id ?? null,
        id: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: null,
      },
      {
        side: "credit",
        accountName: credit?.name ?? "",
        accountType: credit?.accountType ?? "asset",
        amount: "",
        bookAccountId: credit?.id ?? null,
        id: null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: null,
      },
    ],
    description: "",
    businessRateInput: "",
    businessRate: null,
  };
}

function resolveNewEntryDefaultDate(input: {
  today: Date;
  displayedMonth: YearMonthValue;
  periodStartDate: string | null;
  periodEndDate: string | null;
}): string {
  const todayText = formatIsoLocalDate(input.today);
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

function isDateWithinRange(
  dateText: string,
  startDate: string | null,
  endDate: string | null,
): boolean {
  if (startDate != null && dateText < startDate) return false;
  if (endDate != null && dateText > endDate) return false;
  return true;
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
