"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AppError,
  isOpeningCarryoverCandidate,
  type EntryRecord,
  type FiscalPeriod,
} from "@rubydogjp/openkk-driver";
import {
  useOpenkkAppState,
  useOpenkkAssist,
  useOpenkkEntries,
} from "../../bindings/index.js";
import { AppErrorText } from "../../shared/app-error-text.js";
import { useConfirmDialog } from "../../shared/confirm-dialog.js";
import {
  palette,
  radii,
  sizes,
  typography,
} from "../../shared/design-tokens.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import { CarryCheckboxItem, CheckboxStyles } from "../carry-checkbox.js";
import {
  StepFormRow,
  StepMetaCard,
  StepPrimaryButton,
  StepSecondaryButton,
} from "../step-ui.js";

type CarryItems = {
  bs: boolean;
  transfer: boolean;
  fixed: boolean;
};

const CARRY_ITEM_LABELS: Record<keyof CarryItems, string> = {
  bs: "期末のBS → 期首のBS",
  transfer: "期末の振替 → 期首の再振替",
  fixed: "固定資産データ",
};

const DEFAULT_CARRY_ITEMS: CarryItems = {
  bs: true,
  transfer: false,
  fixed: false,
};

export function carryoverSourceCandidates(
  target: FiscalPeriod,
  periods: FiscalPeriod[],
): FiscalPeriod[] {
  return periods
    .filter(
      (period) =>
        period.id !== target.id &&
        period.phase === "post_closing" &&
        period.documentsReceivedCompleted &&
        period.archiveStatus !== "purged" &&
        period.endDate < target.startDate,
    )
    .sort((left, right) => right.endDate.localeCompare(left.endDate));
}

export function OpeningBsCarryover({
  target,
  sources,
}: {
  target: FiscalPeriod;
  sources: FiscalPeriod[];
}) {
  const appState = useOpenkkAppState();
  const entriesState = useOpenkkEntries();
  const assist = useOpenkkAssist();
  const { confirm, dialog } = useConfirmDialog();
  const [isOpen, setIsOpen] = useState(false);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [items, setItems] = useState<CarryItems>(DEFAULT_CARRY_ITEMS);
  const [reversalEntryIds, setReversalEntryIds] = useState<string[]>([]);
  const [sourceEntries, setSourceEntries] = useState<EntryRecord[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [screenError, setScreenError] = useState<unknown>(null);
  const applyLock = useRef(new ExclusiveActionLock());
  const source = sources.find((period) => period.id === sourceId) ?? null;
  const loadFiscalPeriodEntries = entriesState.loadFiscalPeriodEntries;
  const latestSourceId = sources[0]?.id ?? "";

  useEffect(() => {
    setSourceId(latestSourceId);
  }, [target.id, latestSourceId]);

  useEffect(() => {
    setReversalEntryIds([]);
    setSourceEntries([]);
  }, [sourceId, items.transfer]);

  useEffect(() => {
    if (!isOpen || !items.transfer || sourceId === "") return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadFiscalPeriodEntries(sourceId);
        if (!cancelled) setSourceEntries(loaded);
      } catch (error) {
        if (!cancelled) setScreenError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, items.transfer, sourceId, loadFiscalPeriodEntries]);

  const reversalCandidates = useMemo(
    () => sourceEntries.filter(isOpeningCarryoverCandidate),
    [sourceEntries],
  );
  const hasSelection = items.bs || items.transfer || items.fixed;

  if (!isOpen) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <StepSecondaryButton onClick={() => setIsOpen(true)}>
          前の期間から引き継ぐ
        </StepSecondaryButton>
      </div>
    );
  }

  const handleApply = async () => {
    if (source == null || !hasSelection) return;
    const release = applyLock.current.tryAcquire();
    if (release == null) return;
    try {
      const replaced = (Object.keys(items) as Array<keyof CarryItems>)
        .filter((key) => items[key])
        .map((key) => CARRY_ITEM_LABELS[key]);
      const confirmed = await confirm({
        tone: "danger",
        title: "前の期間から引き継ぐ",
        body: [
          `「${source.name}」から次の項目を引き継ぎ、今の内容を上書きします。`,
          ...replaced.map((label) => `・${label}`),
          "引き継いだ後も、仮締めまでは編集できます。",
        ],
        confirmLabel: "上書きする",
      });
      if (!confirmed) return;
      setIsApplying(true);
      await appState.applyCarryoverToFiscalPeriod(target.id, {
        sourceFiscalPeriodId: source.id,
        carryBalances: items.bs,
        reversalEntryIds: items.transfer ? reversalEntryIds : null,
        carryFixedAssets: items.fixed,
      });
      if (items.fixed) assist.reload();
      setScreenError(null);
      setIsOpen(false);
      setItems(DEFAULT_CARRY_ITEMS);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "前の期間からの引き継ぎに失敗しました",
          fallbackDeveloperMessage:
            "steps/opening-bs-carryover: applyCarryover failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsApplying(false);
      release();
    }
  };

  return (
    <section aria-label="前の期間から引き継ぐ">
      {dialog}
      <CheckboxStyles />
      <StepMetaCard>
        <StepFormRow
          label="引き継ぎ元"
          divider={false}
          control={
            <select
              aria-label="引き継ぎ元"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              style={selectStyle}
            >
              {sources.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          }
          hint={null}
        />
        <StepFormRow
          label="引き継ぎ項目"
          divider
          control={
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(Object.keys(CARRY_ITEM_LABELS) as Array<keyof CarryItems>).map(
                (key) => (
                  <CarryCheckboxItem
                    key={key}
                    inputId={`opening-carry-${key}`}
                    checked={items[key]}
                    onChange={() =>
                      setItems((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                    label={CARRY_ITEM_LABELS[key]}
                    disabled={isApplying}
                  />
                ),
              )}
            </div>
          }
          hint="選んだ項目は、今の内容を置き換えます。選ばなかった項目はそのまま残ります。"
        />
        {items.transfer ? (
          <StepFormRow
            label="再振替する仕訳"
            divider
            control={
              <div>
                {reversalCandidates.map((entry) => (
                  <CarryCheckboxItem
                    key={entry.id}
                    inputId={`opening-reversal-${entry.id}`}
                    checked={reversalEntryIds.includes(entry.id)}
                    onChange={() =>
                      setReversalEntryIds((ids) =>
                        ids.includes(entry.id)
                          ? ids.filter((id) => id !== entry.id)
                          : [...ids, entry.id],
                      )
                    }
                    label={`${entry.date} ${entry.description}`}
                    disabled={isApplying}
                  />
                ))}
                {reversalCandidates.length === 0
                  ? "候補の仕訳はありません"
                  : null}
              </div>
            }
            hint="何も選ばずに引き継ぐと、今の再振替は空になります。"
          />
        ) : null}
      </StepMetaCard>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "flex-end",
          gap: 12,
        }}
      >
        <StepSecondaryButton onClick={() => setIsOpen(false)}>
          閉じる
        </StepSecondaryButton>
        <StepPrimaryButton
          onClick={handleApply}
          disabled={isApplying || source == null || !hasSelection}
          variant={null}
          icon={null}
        >
          {isApplying ? "引き継ぎ中…" : "引き継いで上書き"}
        </StepPrimaryButton>
      </div>
      {screenError != null ? (
        <div style={{ marginTop: 12 }}>
          <AppErrorText
            error={screenError}
            style={null}
            fallbackUserMessage={null}
          />
        </div>
      ) : null}
    </section>
  );
}

const selectStyle = {
  height: sizes.field.height,
  minWidth: 200,
  boxSizing: "border-box" as const,
  border: `1px solid ${palette.borderStrong}`,
  borderRadius: radii.sm,
  background: palette.surface,
  padding: `0 ${sizes.field.paddingX}`,
  ...typography.input,
  color: palette.text,
  fontFamily: "inherit" as const,
};
