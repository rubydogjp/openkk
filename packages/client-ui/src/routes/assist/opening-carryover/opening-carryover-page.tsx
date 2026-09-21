"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation.js";

import {
  AppError,
  recordToPreviewRows,
  type EntryRecord,
  buildPeriodLockMessage,
  resolveEditingPolicy,
  type OpeningCarryoverDraft,
  type OpeningCarryoverRecord,
} from "@rubydogjp/openkk-client-domain";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkConfig,
  useOpenkkEntries,
  type EntryDraft,
} from "@rubydogjp/openkk-client-usecases";
import { EntriesTable } from "../../../entries/entries-ui.js";
import { EntryEditDrawer } from "../../../entries/entry-edit-drawer.js";
import { entryRecordToDraft } from "../../../entries/entry-edit-model.js";
import { AssistBreadcrumb } from "../../../assist/assist-breadcrumb.js";
import { buildNewOpeningCarryoverDraft } from "../../../assist/opening-carryover-draft.js";
import { ClosedPeriodLock } from "../../../shared/closed-period-lock.js";
import { isoDateToWeekday } from "../../../shared/date-picker.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  sizes,
  spacing,
} from "../../../shared/design-tokens.js";

export function OpeningCarryoverPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appState = useOpenkkAppState();
  const assistState = useOpenkkAssist();
  const entriesState = useOpenkkEntries();
  const config = useOpenkkConfig();
  const editingLocked = resolveEditingPolicy(config.editingPolicy).locked;
  const [newCarryoverDraft, setNewCarryoverDraft] =
    useState<OpeningCarryoverDraft | null>(null);
  const fiscalPeriodId = appState.currentFiscalPeriodId;
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );
  const lockMessage = buildPeriodLockMessage(currentFiscalPeriod ?? null, null);
  const isReadOnlyPeriod =
    currentFiscalPeriod?.phase === "post_closing" ||
    currentFiscalPeriod?.phase === "pre_closing";
  const screenLockMessage = isReadOnlyPeriod ? null : lockMessage;
  const records = useMemo(
    () =>
      fiscalPeriodId == null
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
      : (records.find((record) => record.id === drawerCarryoverId) ?? null);
  const drawerEntry: EntryDraft | null =
    newCarryoverDraft ??
    (drawerCarryover == null
      ? null
      : entryRecordToDraft(carryoverToEntryRecord(drawerCarryover)));

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

  useEffect(() => {
    setNewCarryoverDraft(null);
  }, [fiscalPeriodId]);

  const closeDrawer = () => {
    setNewCarryoverDraft(null);
    navigateWithCarryoverParam(null);
  };

  const handleAdd = () => {
    if (fiscalPeriodId == null || currentFiscalPeriod == null) return;
    navigateWithCarryoverParam(null);
    setNewCarryoverDraft(
      buildNewOpeningCarryoverDraft(
        currentFiscalPeriod.startDate,
        entriesState.accountOptions,
      ),
    );
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
          {isReadOnlyPeriod || editingLocked ? (
            <LockedCarryoverButton
              label={isReadOnlyPeriod ? "記録終了" : "編集ロック"}
            />
          ) : lockMessage == null && fiscalPeriodId != null ? (
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
            readOnly={isReadOnlyPeriod || editingLocked}
            activeRecordId={
              !isReadOnlyPeriod &&
              !editingLocked &&
              newCarryoverDraft == null &&
              drawerCarryover != null
                ? drawerCarryover.id
                : null
            }
            onOpenEntry={
              isReadOnlyPeriod || editingLocked
                ? null
                : (row) => {
                    navigateWithCarryoverParam(row.recordId);
                  }
            }
            onAddEntry={null}
          />
        )}
      </div>
      {fiscalPeriodId != null &&
      drawerEntry != null &&
      !isReadOnlyPeriod &&
      !editingLocked ? (
        <EntryEditDrawer
          key={
            newCarryoverDraft == null && drawerCarryover != null
              ? `edit:${drawerCarryover.id}`
              : "create"
          }
          mode={newCarryoverDraft == null ? "edit" : "create"}
          entry={drawerEntry}
          minDate={currentFiscalPeriod?.startDate ?? null}
          maxDate={currentFiscalPeriod?.endDate ?? null}
          accountOptions={entriesState.accountOptions}
          taxCategoryOptions={entriesState.taxCategoryOptions}
          businessCategoryOptions={entriesState.businessCategoryOptions}
          suggestions={entriesState.listSuggestions(fiscalPeriodId)}
          onClose={closeDrawer}
          onSave={async (draft) => {
            const carryoverDraft = entryDraftToCarryoverDraft(draft);
            const ok =
              newCarryoverDraft == null && drawerCarryover != null
                ? await assistState.updateOpeningCarryover(
                    drawerCarryover.id,
                    carryoverDraft,
                  )
                : newCarryoverDraft != null
                  ? (await assistState.addOpeningCarryover(
                      fiscalPeriodId,
                      carryoverDraft,
                    )) != null
                  : false;
            if (ok) {
              closeDrawer();
            } else {
              throw new AppError({
                messageForDeveloper: "updateOpeningCarryover returned false",
                messageForUser: "再振替仕訳の保存に失敗しました",
                originalMessage: null,
                statusCode: null,
                code: null,
              });
            }
          }}
          onDelete={
            newCarryoverDraft == null && drawerCarryover != null
              ? async () => {
                  const ok = await assistState.deleteOpeningCarryover(
                    drawerCarryover.id,
                  );
                  if (ok) {
                    closeDrawer();
                  } else {
                    throw new AppError({
                      messageForDeveloper:
                        "deleteOpeningCarryover returned false",
                      messageForUser: "再振替仕訳の削除に失敗しました",
                      originalMessage: null,
                      statusCode: null,
                      code: null,
                    });
                  }
                }
              : null
          }
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

function LockedCarryoverButton({ label }: { label: string }) {
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
      <LockGlyph /> {label}
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

function carryoverToEntryRecord(record: OpeningCarryoverRecord): EntryRecord {
  return {
    id: record.id,
    fiscalPeriodId: record.fiscalPeriodId,
    date: record.date,
    weekday: isoDateToWeekday(record.date),
    description: record.description,
    businessRate: record.businessRate,
    lines: record.lines,
    localId: null,
  };
}

function entryDraftToCarryoverDraft(draft: EntryDraft): OpeningCarryoverDraft {
  return {
    date: draft.date,
    description: draft.description,
    businessRateInput: draft.businessRateInput,
    businessRate: draft.businessRate,
    lines: draft.lines.map((line) => ({ ...line })),
  };
}
