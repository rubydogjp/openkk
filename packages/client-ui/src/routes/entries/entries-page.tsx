"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation.js";

import {
  AppError,
  assertEntryImportSize,
  buildVirtualEntryRows,
  decodeJournalImportBytes,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  importEntriesFromCsv,
  importEntriesFromJson,
  buildPeriodLockMessage,
  compareYearMonth,
  formatIsoLocalDate,
  formatYearMonthKey,
  isMaterializedVirtualEntry,
  parseYearMonth,
  type YearMonth,
} from "@rubydogjp/openkk-client-domain";
import {
  usePlatformAdapter,
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
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import { pathWithSearchParams } from "../../shared/pathname.js";

export function EntriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appState = useOpenkkAppState();
  const files = usePlatformAdapter().files;
  const openkkConfig = useOpenkkConfig();
  const today = useOpenkkToday();
  const entriesState = useOpenkkEntries();
  const assistState = useOpenkkAssist();
  const editingLocked = openkkConfig.editingPolicy.locked;
  const currentFiscalPeriod = appState.currentFiscalPeriod;
  const fiscalPeriodId = appState.currentFiscalPeriodId;
  const [displayedMonth, setDisplayedMonth] = useState<YearMonth>(() =>
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
  const canGoPrevious =
    periodStartMonth == null ||
    compareYearMonth(displayedMonth, periodStartMonth) > 0;
  const canGoNext =
    periodEndMonth == null ||
    compareYearMonth(displayedMonth, periodEndMonth) < 0;
  const yearMonth = formatYearMonthKey(displayedMonth);
  const lockedMessage = buildPeriodLockMessage(
    currentFiscalPeriod,
    "仕訳を記録できます",
  );
  const isReadOnlyPeriod =
    currentFiscalPeriod?.phase === "post_closing" ||
    currentFiscalPeriod?.phase === "pre_closing";
  const screenLockedMessage = isReadOnlyPeriod ? null : lockedMessage;
  const importLockedMessage = buildPeriodLockMessage(
    currentFiscalPeriod,
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
  const virtualRows = useMemo(
    () =>
      fiscalPeriodId == null
        ? []
        : buildVirtualEntryRows({
            fiscalPeriodId,
            periodStartDate: currentFiscalPeriod?.startDate ?? null,
            periodEndDate: currentFiscalPeriod?.endDate ?? null,
            entries: fullPeriodEntries,
            assets: assistState.listFixedAssets(fiscalPeriodId),
            carryovers: assistState.listOpeningCarryovers(fiscalPeriodId),
            yearMonth,
          }),
    [
      assistState,
      currentFiscalPeriod?.startDate,
      currentFiscalPeriod?.endDate,
      fiscalPeriodId,
      fullPeriodEntries,
      yearMonth,
    ],
  );
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
    (month: YearMonth) => {
      const nextMonth = clampMonthToPeriod(
        month,
        currentFiscalPeriod?.startDate ?? null,
        currentFiscalPeriod?.endDate ?? null,
      );
      setDisplayedMonth(nextMonth);
      setNewEntryDraft(null);
      const next = new URLSearchParams(searchParams.toString());
      next.set("month", formatYearMonthKey(nextMonth));
      next.delete("entry");
      next.delete("virtualEntry");
      router.replace(pathWithSearchParams("/entries", next), { scroll: false });
    },
    [
      currentFiscalPeriod?.endDate,
      currentFiscalPeriod?.startDate,
      router,
      searchParams,
    ],
  );

  const navigateWithDrawerParam = useCallback(
    (key: "entry" | "virtualEntry", id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("month", yearMonth);
      next.delete("entry");
      next.delete("virtualEntry");
      if (id != null) next.set(key, id);
      router.replace(pathWithSearchParams("/entries", next), { scroll: false });
    },
    [router, searchParams, yearMonth],
  );

  const openDrawer = useCallback(
    (entryId: string) => {
      setNewEntryDraft(null);
      navigateWithDrawerParam("entry", entryId);
    },
    [navigateWithDrawerParam],
  );
  const closeDrawer = useCallback(
    () => navigateWithDrawerParam("entry", null),
    [navigateWithDrawerParam],
  );
  const closeVirtualDrawer = useCallback(
    () => navigateWithDrawerParam("virtualEntry", null),
    [navigateWithDrawerParam],
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
      (entry) => !isMaterializedVirtualEntry(entry),
    );
    const data =
      kind === "json"
        ? exportEntriesAsJson(manualEntriesForFileExport)
        : `\uFEFF${exportEntriesAsCsv(manualEntriesForFileExport)}`;
    const filename = `${fiscalPeriodId}_journal.${kind}`;
    files.save(
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
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={() => navigateWithMonth(shiftMonth(displayedMonth, -1))}
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
                navigateWithDrawerParam("entry", null);
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
                  navigateWithDrawerParam("virtualEntry", row.virtual.id);
                  return;
                }
                if (isReadOnlyPeriod) return;
                openDrawer(row.recordId);
              }
            : null
        }
        onImportFile={canImport && !isImporting ? handleImportFile : null}
        onExport={fiscalPeriodId != null ? handleExport : null}
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
            await entriesState.createEntryFromDraft(fiscalPeriodId, draft);
            if (!navigateToEntryDateMonth(draft.date)) {
              closeNewEntryDrawer();
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

function clampMonthToPeriod(
  month: YearMonth,
  startDate: string | null,
  endDate: string | null,
): YearMonth {
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

function shiftMonth(month: YearMonth, offset: number): YearMonth {
  const nextDate = new Date(month.year, month.month - 1 + offset, 1);
  return {
    year: nextDate.getFullYear(),
    month: nextDate.getMonth() + 1,
  };
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
    description: "",
    businessRateInput: "",
    businessRate: null,
    lines: [
      {
        id: null,
        side: "debit",
        accountName: debit?.name ?? "",
        accountType: debit?.accountType ?? "expense",
        amount: "",
        bookAccountId: debit?.id ?? null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: null,
      },
      {
        id: null,
        side: "credit",
        accountName: credit?.name ?? "",
        accountType: credit?.accountType ?? "asset",
        amount: "",
        bookAccountId: credit?.id ?? null,
        partnerName: null,
        taxCategoryId: null,
        taxCategoryName: "対象外",
        businessCategoryId: null,
        businessCategoryName: null,
      },
    ],
  };
}

function resolveNewEntryDefaultDate(input: {
  today: Date;
  displayedMonth: YearMonth;
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

  const displayedMonthFirstDate = `${formatYearMonthKey(input.displayedMonth)}-01`;
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
  startDate: string,
  endDate: string,
): boolean {
  return startDate <= dateText && dateText <= endDate;
}

function parseMonthParam(value: string | null): YearMonth | null {
  if (value == null) return null;
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  if (matched == null) return null;
  const month = Number(matched[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(matched[1]), month };
}
