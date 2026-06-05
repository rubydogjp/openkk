"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  AppError,
  recordToPreviewRows,
  type EntryRecord,
  buildPeriodLockMessage,
  type OpeningCarryoverRecord,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkEntries,
  type EntryDraft,
} from "@rubydogjp/openkk-client-usecases";
import { EntriesTable } from "../../../entries/entries-ui";
import { EntryEditDrawer } from "../../../entries/entry-edit-drawer";
import { AssistBreadcrumb } from "../../../assist/assist-breadcrumb";
import { ClosedPeriodLock } from "../../../shared/closed-period-lock";
import { isoDateToWeekday } from "../../../shared/date-picker";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../../../shared/design-tokens";

export function OpeningCarryoverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appState = useOpenkkAppState();
  const assistState = useOpenkkAssist();
  const entriesState = useOpenkkEntries();
  const fiscalPeriodId = appState.currentFiscalPeriodId ?? "";
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const lockMessage = buildPeriodLockMessage(currentFiscalPeriod);
  const isReadOnlyPeriod =
    currentFiscalPeriod?.stage === "post_closing" ||
    currentFiscalPeriod?.provisionalClosingCompleted === true;
  const screenLockMessage = isReadOnlyPeriod ? null : lockMessage;
  const records = useMemo(
    () =>
      fiscalPeriodId === ""
        ? []
        : assistState.listOpeningCarryovers(fiscalPeriodId),
    [fiscalPeriodId, assistState],
  );
  const entryRecords = useMemo(
    () => records.map(carryoverToEntryRecord),
    [records],
  );
  const rows = useMemo(
    () => entryRecords.flatMap((record) => recordToPreviewRows(record)),
    [entryRecords],
  );
  const drawerCarryoverId = searchParams.get("carryover");
  const drawerCarryover =
    drawerCarryoverId == null
      ? null
      : records.find((record) => record.id === drawerCarryoverId) ?? null;
  const drawerEntry =
    drawerCarryover == null ? null : carryoverToEntryRecord(drawerCarryover);

  const navigateWithCarryoverParam = (carryoverId: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (carryoverId == null) {
      next.delete("carryover");
    } else {
      next.set("carryover", carryoverId);
    }
    const query = next.toString();
    router.replace(
      query.length > 0
        ? `/assist/opening-carryover?${query}`
        : "/assist/opening-carryover",
      { scroll: false },
    );
  };

  const handleAdd = async () => {
    if (fiscalPeriodId === "") return;
    const createdId = await assistState.addOpeningCarryover(fiscalPeriodId);
    if (createdId != null) {
      navigateWithCarryoverParam(createdId);
    }
  };

  return (

    <section
      style={{
        padding: 24,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: sizes.content.dataMaxWidth,
          width: "100%",
          margin: "0 auto",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 22 }}>
          <AssistBreadcrumb current="再振替" />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 14,
          }}
        >
          {isReadOnlyPeriod ? (
            <LockedCarryoverButton />
          ) : lockMessage == null && fiscalPeriodId !== "" ? (
            <AddCarryoverButton onClick={handleAdd} />
          ) : null}
        </div>

        {screenLockMessage != null ? (
          <ClosedPeriodLock
            title={screenLockMessage.title}
            description={screenLockMessage.description}
          />
        ) : (
          <EntriesTable
            rows={rows}
            fillHeight
            headerTone="warning"
            readOnly={isReadOnlyPeriod}
            activeRecordId={
              !isReadOnlyPeriod && drawerCarryover != null
                ? drawerCarryover.id
                : null
            }
            onOpenEntry={
              isReadOnlyPeriod
                ? undefined
                : (row) => {
                    if (row.recordId == null) return;
                    navigateWithCarryoverParam(row.recordId);
                  }
            }
          />
        )}
      </div>
      {drawerEntry != null && drawerCarryover != null && !isReadOnlyPeriod ? (
        <EntryEditDrawer
          entry={drawerEntry}
          accountOptions={entriesState.accountOptions}
          taxCategoryOptions={entriesState.taxCategoryOptions}
          businessCategoryOptions={entriesState.businessCategoryOptions}
          suggestions={entriesState.listSuggestions(fiscalPeriodId)}
          onClose={() => navigateWithCarryoverParam(null)}
          onSave={async (draft) => {
            const ok = await assistState.updateOpeningCarryover(
              drawerCarryover.id,
              entryDraftToCarryoverDraft(drawerCarryover, draft),
            );
            if (ok) {
              navigateWithCarryoverParam(null);
            } else {
              throw new AppError({
                messageForDeveloper: "updateOpeningCarryover returned false",
                messageForUser: "再振替仕訳の保存に失敗しました",
                originalMessage: null,
                statusCode: null,
              });
            }
          }}
          onDelete={async () => {
            const ok = await assistState.deleteOpeningCarryover(drawerCarryover.id);
            if (ok) {
              navigateWithCarryoverParam(null);
            } else {
              throw new AppError({
                messageForDeveloper: "deleteOpeningCarryover returned false",
                messageForUser: "再振替仕訳の削除に失敗しました",
                originalMessage: null,
                statusCode: null,
              });
            }
          }}
        />
      ) : null}
    </section>
  );
}

function AddCarryoverButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: "none",
        background: palette.brand,
        color: palette.surface,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
        boxShadow: "0 1px 2px rgba(37, 99, 235, 0.18)",
      }}
    >
      <PlusGlyph /> 追加
    </button>
  );
}

function LockedCarryoverButton() {
  return (
    <button
      type="button"
      disabled
      style={{
        height: sizes.button.compactHeight,
        minWidth: sizes.button.compactIconTextMinWidth,
        padding: "0 14px",
        borderRadius: radii.sm,
        border: `1px solid ${palette.borderStrong}`,
        background: palette.surface,
        color: palette.textSoft,
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        cursor: "default",
        display: "inline-flex",
        alignItems: "center",
        gap: spacing.s6,
      }}
    >
      <LockGlyph /> 記録終了
    </button>
  );
}

function PlusGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 15,
        height: 15,
        display: "block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        maskImage: "url('/icons/lock.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/lock.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function carryoverToEntryRecord(
  record: OpeningCarryoverRecord,
): EntryRecord {
  return {
    id: record.id,
    fiscalPeriodId: record.fiscalPeriodId,
    date: record.date,
    weekday: isoDateToWeekday(record.date),
    debit: record.debit,
    debitType: record.debitType,
    debitAmount: record.debitAmount,
    credit: record.credit,
    creditType: record.creditType,
    creditAmount: record.creditAmount,
    description: record.description,
    partner: record.partner,
    businessRate: record.businessRate,
    taxCategory: record.taxCategory,
    businessCategory: record.businessCategory,
    debitBookAccountId: record.debitBookAccountId,
    creditBookAccountId: record.creditBookAccountId,
    lines: [
      {
        side: "debit",
        accountName: record.debit,
        accountType: record.debitType,
        amount: record.debitAmount,
        bookAccountId: record.debitBookAccountId,
      },
      {
        side: "credit",
        accountName: record.credit,
        accountType: record.creditType,
        amount: record.creditAmount,
        bookAccountId: record.creditBookAccountId,
      },
    ],
  };
}

function entryDraftToCarryoverDraft(
  fallback: OpeningCarryoverRecord,
  draft: EntryDraft,
) {
  const debit = draft.lines.find((line) => line.side === "debit");
  const credit = draft.lines.find((line) => line.side === "credit");
  return {
    date: draft.date,
    description: draft.description,
    debit: debit?.accountName ?? fallback.debit,
    debitType: debit?.accountType ?? fallback.debitType,
    debitAmount: debit?.amount ?? fallback.debitAmount,
    debitBookAccountId: debit?.bookAccountId ?? fallback.debitBookAccountId,
    credit: credit?.accountName ?? fallback.credit,
    creditType: credit?.accountType ?? fallback.creditType,
    creditAmount: credit?.amount ?? fallback.creditAmount,
    creditBookAccountId: credit?.bookAccountId ?? fallback.creditBookAccountId,
    partner: draft.partner,
    taxCategory: draft.taxCategory,
    businessCategory: draft.businessCategory,
    businessRate: draft.businessRate,
  };
}
