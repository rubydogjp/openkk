"use client";

import { useMemo, useState, type ReactNode } from "react";

import { AppError, OPENING_EQUITY_LABELS } from "@rubydogjp/openkk-client-domain";
import { AppErrorText } from "../../shared/app-error-text";
import { useOpenkkAppState, useOpenkkConfig } from "@rubydogjp/openkk-client-usecases";
import { AccountChipCell } from "../../entries/entries-ui";
import type { EntryAccountVisualType } from "@rubydogjp/openkk-client-domain";
import {
  AmountInput,
  AmountReadOnlyField,
  AmountText,
} from "../../shared/amount-field";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  spacing,
  typography,
} from "../../shared/design-tokens";
import { DemoIcon } from "../../shared/demo-icon";
import { FormStyles } from "../../shared/form-fields";
import { StepCallout, StepPrimaryButton, StepSecondaryButton } from "../step-ui";

const BS_ROWS: Array<{ assetLabel: string; liabilityLabel: string }> = [
  { assetLabel: "現金", liabilityLabel: "支払手形" },
  { assetLabel: "当座預金", liabilityLabel: "買掛金" },
  { assetLabel: "定期預金", liabilityLabel: "借入金" },
  { assetLabel: "その他の預金", liabilityLabel: "未払金" },
  { assetLabel: "受取手形", liabilityLabel: "前受金" },
  { assetLabel: "売掛金", liabilityLabel: "預り金" },
  { assetLabel: "有価証券", liabilityLabel: "" },
  { assetLabel: "棚卸資産", liabilityLabel: "" },
  { assetLabel: "前払金", liabilityLabel: "" },
  { assetLabel: "貸付金", liabilityLabel: "" },
  { assetLabel: "建物", liabilityLabel: "" },
  { assetLabel: "建物附属設備", liabilityLabel: "" },
  { assetLabel: "機械装置", liabilityLabel: "" },
  { assetLabel: "車両運搬具", liabilityLabel: "貸倒引当金" },
  { assetLabel: "工具器具備品", liabilityLabel: "" },
  { assetLabel: "土地", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "" },
  { assetLabel: "", liabilityLabel: "事業主借" },
  { assetLabel: "", liabilityLabel: "元入金" },
  { assetLabel: "事業主貸", liabilityLabel: "" },
];

const HANDLED_ASSET_NAMES = new Set<string>([
  "現金",
  "当座預金",
  "普通預金",
  "定期預金",
  "その他の預金",
  "受取手形",
  "売掛金",
  "有価証券",
  "棚卸資産",
  "商品",
  "前払金",
  "前払費用",
  "貸付金",
  "建物",
  "建物附属設備",
  "機械装置",
  "車両運搬具",
  "工具器具備品",
  "土地",
  "事業主貸",
]);

const EQUITY_LABELS = OPENING_EQUITY_LABELS;

const assetKey = (label: string) => `a:${label}`;
const liabilityKey = (label: string) => `l:${label}`;
const isEditableLiability = (label: string) => label !== "";
const liabilityAccountType = (label: string): EntryAccountVisualType =>
  EQUITY_LABELS.has(label) ? "equity" : "liability";

function parseInputAmount(value: string): number {
  const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

type AssetSlot = { kind: "fixed" | "extra"; label: string };

function buildAssetSlots(
  openingBalanceLines: Array<{ accountId: string }>,
): AssetSlot[] {
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const line of openingBalanceLines) {
    if (!line.accountId.startsWith("a:")) continue;
    const name = line.accountId.slice(2);
    if (HANDLED_ASSET_NAMES.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    extras.push(name);
  }
  return BS_ROWS.map((row, index): AssetSlot => {
    if (row.assetLabel !== "") return { kind: "fixed", label: row.assetLabel };
    if (index >= 16 && index <= 21) {
      const extraIndex = index - 16;
      return { kind: "extra", label: extras[extraIndex] ?? "" };
    }
    return { kind: "fixed", label: "" };
  });
}

function buildInitialAmounts(
  openingBalanceLines: Array<{ accountId: string; amount: number }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of openingBalanceLines) {
    if (line.amount > 0) map[line.accountId] = String(line.amount);
  }
  return map;
}

export function OpeningBsBody({
  onSwitchToStep,
}: {
  onSwitchToStep?: (no: number) => void;
}) {
  const config = useOpenkkConfig();
  const appState = useOpenkkAppState();
  const [screenError, setScreenError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingCompleted, setIsEditingCompleted] = useState(false);
  const currentFiscalPeriod = appState.fiscalPeriods.find(
    (period) => period.id === appState.currentFiscalPeriodId,
  );

  const openingBalanceLines =
    currentFiscalPeriod?.opening?.openingBalanceLines ?? [];
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    buildInitialAmounts(openingBalanceLines),
  );
  const assetSlots = useMemo(
    () => buildAssetSlots(openingBalanceLines),
    [openingBalanceLines],
  );

  const assetTotal = useMemo(() => {
    let total = 0;
    for (const slot of assetSlots) {
      if (slot.label === "") continue;
      total += parseInputAmount(amounts[assetKey(slot.label)] ?? "");
    }
    return total;
  }, [amounts, assetSlots]);

  const liabilityTotal = useMemo(() => {
    return BS_ROWS.filter((row) =>
      isEditableLiability(row.liabilityLabel),
    ).reduce(
      (sum, row) =>
        sum + parseInputAmount(amounts[liabilityKey(row.liabilityLabel)] ?? ""),
      0,
    );
  }, [amounts]);

  if (currentFiscalPeriod == null) {
    return (
      <div style={{ color: palette.textLabel }}>期間を選択してください</div>
    );
  }
  const isNotStarted = !currentFiscalPeriod.settingsCompleted;

  const isPeriodLocked =
    currentFiscalPeriod.stage === "post_closing" ||
    currentFiscalPeriod.provisionalClosingCompleted === true;

  const isCompleted = currentFiscalPeriod.openingBalancesCompleted;
  const isEditing =
    !isNotStarted && !isPeriodLocked && (!isCompleted || isEditingCompleted);
  const isMockMode = config.isMockMode;

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (isMockMode) {
        const lines = [
          ...assetSlots.flatMap((slot) => {
            if (slot.label === "") return [];
            const key = assetKey(slot.label);
            const amount = parseInputAmount(amounts[key] ?? "");
            if (amount <= 0) return [];
            return [{ id: key, accountId: key, amount }];
          }),
          ...BS_ROWS.flatMap((row) => {
            if (!isEditableLiability(row.liabilityLabel)) return [];
            const key = liabilityKey(row.liabilityLabel);
            const amount = parseInputAmount(amounts[key] ?? "");
            if (amount <= 0) return [];
            return [{ id: key, accountId: key, amount }];
          }),
        ];
        const updated = await appState.updateFiscalPeriod(
          currentFiscalPeriod.id,
          {
            openingBalancesCompleted: true,
            openingDebitTotal: assetTotal,
            openingCreditTotal: liabilityTotal,
            opening: {
              ...(currentFiscalPeriod.opening ?? {
                id: `op-${currentFiscalPeriod.id}`,
                userId: appState.session?.userId ?? "",
                fiscalPeriodId: currentFiscalPeriod.id,
                carryoverJournals: [],
              }),
              openingBalanceLines: lines,
            },
          },
        );
        if (!updated) return;
      } else {
        const updated = await appState.updateFiscalPeriod(
          currentFiscalPeriod.id,
          {
            openingBalancesCompleted: true,
            openingDebitTotal: assetTotal,
            openingCreditTotal: liabilityTotal,
          },
        );
        if (!updated) return;
      }
      setScreenError(null);
      setIsEditingCompleted(false);
      onSwitchToStep?.(3);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "期首のBSの更新に失敗しました",
          fallbackDeveloperMessage:
            "steps/opening-bs: updateFiscalPeriod failed",
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <FormStyles />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,

          paddingBottom: 56,
        }}
      >
        {isNotStarted ? (
          <StepCallout tone="warning">
            この手順はまだ進められません。
          </StepCallout>
        ) : null}

        {isPeriodLocked ? (
          <StepCallout tone="info">
            仮締め以降のため変更できません。
          </StepCallout>
        ) : null}

        {!isPeriodLocked && isCompleted && !isEditing ? (
          <SavedCommentSection
            isDemo={config.isDemoMode}
            onEdit={() => setIsEditingCompleted(true)}
          />
        ) : null}

        <div
          style={{
            background: palette.surface,
            border: `1px solid ${palette.borderEmphasis}`,
            borderRadius: 12,
            boxShadow: shadows.card,
            overflow: "hidden",
            position: "relative",
          }}
        >

          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 1,
              background: palette.borderEmphasis,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLUMNS,
              alignItems: "center",
              height: sizes.field.height,
              background: palette.headerSurface,
              borderBottom: `1px solid ${palette.borderSubtle}`,
            }}
          >
            <HeaderCell>資産の部</HeaderCell>
            <HeaderCell align="right">金額</HeaderCell>
            <HeaderCell>負債・純資産の部</HeaderCell>
            <HeaderCell align="right">金額</HeaderCell>
          </div>

          {BS_ROWS.map((row, index) => {
            const assetSlot = assetSlots[index];
            if (!assetSlot) return null;
            const assetLabel = assetSlot.label;
            const liabilityLabel = row.liabilityLabel;
            const assetId = assetKey(assetLabel);
            const liabilityId = liabilityKey(liabilityLabel);
            const assetAmount = amounts[assetId] ?? "";
            const liabilityAmount = amounts[liabilityId] ?? "";
            const assetEditable = assetLabel !== "" && isEditing;
            const liabilityEditable = liabilityLabel !== "" && isEditing;
            return (
              <div
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLUMNS,
                  alignItems: "center",
                  height: 52,
                  background: palette.surface,
                }}
              >
                <ChipCell label={assetLabel} type="asset" />
                <AmountCell
                  hasLabel={assetLabel !== ""}
                  editable={assetEditable}
                  ariaLabel={`${assetLabel} 金額`}
                  value={assetAmount}
                  onChange={(v) => setAmounts((p) => ({ ...p, [assetId]: v }))}
                />
                <ChipCell
                  label={liabilityLabel}
                  type={liabilityAccountType(liabilityLabel)}
                />
                <AmountCell
                  hasLabel={liabilityLabel !== ""}
                  editable={liabilityEditable}
                  ariaLabel={`${liabilityLabel} 金額`}
                  value={liabilityAmount}
                  onChange={(v) =>
                    setAmounts((p) => ({ ...p, [liabilityId]: v }))
                  }
                />
              </div>
            );
          })}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLUMNS,
              alignItems: "center",
              height: 48,
              background: palette.headerSurface,
              borderTop: `1px solid ${palette.borderStrong}`,
            }}
          >
            <TotalLabelCell>合計</TotalLabelCell>
            <TotalAmountCell>
              {assetTotal.toLocaleString("ja-JP")}
            </TotalAmountCell>
            <TotalLabelCell>合計</TotalLabelCell>
            <TotalAmountCell>
              {liabilityTotal.toLocaleString("ja-JP")}
            </TotalAmountCell>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: isNotStarted ? "flex-start" : "flex-end",
          }}
        >
          {isNotStarted ? (
            <StepSecondaryButton onClick={() => onSwitchToStep?.(1)}>
              前の手順へ
            </StepSecondaryButton>
          ) : !isEditing ? (
            <StepPrimaryButton onClick={() => onSwitchToStep?.(3)}>
              次の手順へ
            </StepPrimaryButton>
          ) : (
            <StepPrimaryButton
              onClick={handleSave}
              disabled={isSaving}
              variant="success"
            >
              {isSaving
                ? "保存中…"
                : isCompleted
                  ? "上書き保存"
                  : "保存して次へ"}
            </StepPrimaryButton>
          )}
        </div>

        {screenError != null ? <AppErrorText error={screenError} /> : null}
      </div>
    </>
  );
}

function SavedCommentSection({
  isDemo,
  onEdit,
}: {
  isDemo: boolean;
  onEdit: () => void;
}) {
  return (
    <StepCallout tone="info">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.bold,
            color: palette.text,
            lineHeight: 1.5,
          }}
        >
          保存済み
        </div>
        <div
          style={{
            fontSize: fontSize.base,
            color: palette.textSoft,
            lineHeight: 1.6,
          }}
        >
          仮締めまでの間は編集することが可能です
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={isDemo ? undefined : onEdit}
            disabled={isDemo}
            style={{
              height: sizes.button.compactHeight,
              minWidth: sizes.button.compactMinWidth,
              padding: "0 14px",
              borderRadius: radii.sm,
              border: `1px solid ${isDemo ? palette.borderStrong : palette.brand}`,
              background: palette.surface,
              color: isDemo ? palette.textSoft : palette.brand,
              ...typography.control,
              cursor: isDemo ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.s8,
            }}
          >
            {isDemo ? <DemoIcon size={18} /> : null}
            <span>編集する</span>
          </button>
        </div>
      </div>
    </StepCallout>
  );
}

const AMOUNT_INPUT_W = 120;
const GRID_COLUMNS = "1fr 1fr 1fr 1fr";

function HeaderCell({
  children,
  align,
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {

  if (align === "right") {
    return (
      <div
        style={{
          paddingLeft: 12,
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <div
          style={{
            width: AMOUNT_INPUT_W,
            textAlign: "right",
            fontSize: fontSize.xs,
            fontWeight: fontWeight.bold,
            color: palette.text,
            letterSpacing: "0.02em",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "0 12px",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        color: palette.text,
        letterSpacing: "0.02em",
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}

function ChipCell({
  label,
  type,
}: {
  label: string;
  type: EntryAccountVisualType;
}) {
  if (label === "") {

    return <div />;
  }

  return (
    <div style={{ paddingLeft: 10 }}>
      <AccountChipCell label={label} type={type} />
    </div>
  );
}

function AmountCell({
  hasLabel,
  editable,
  ariaLabel,
  value,
  onChange,
}: {
  hasLabel: boolean;
  editable: boolean;
  ariaLabel: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  if (!hasLabel) {
    return <div />;
  }

  return (
    <div
      style={{ paddingLeft: 12, display: "flex", justifyContent: "flex-start" }}
    >
      <div style={{ width: AMOUNT_INPUT_W }}>
        {editable ? (
          <AmountInput value={value} onChange={onChange} ariaLabel={ariaLabel} />
        ) : (
          <AmountReadOnlyField
            value={value !== "" ? Number(value).toLocaleString("ja-JP") : ""}
          />
        )}
      </div>
    </div>
  );
}

function TotalLabelCell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "0 12px",
        fontSize: fontSize.base,
        fontWeight: fontWeight.bold,
        color: palette.text,
      }}
    >
      {children}
    </div>
  );
}

function TotalAmountCell({ children }: { children: ReactNode }) {

  return (
    <div
      style={{ paddingLeft: 12, display: "flex", justifyContent: "flex-start" }}
    >
      <div style={{ width: AMOUNT_INPUT_W, textAlign: "right" }}>
        <AmountText bold>{children}</AmountText>
      </div>
    </div>
  );
}
