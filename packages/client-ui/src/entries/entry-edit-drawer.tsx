"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { StepFormRow } from "../steps/step-ui";
import { AmountInput } from "../shared/amount-field";
import { DatePickerButton } from "../shared/date-picker";
import { fontSize, fontWeight, palette, radii, rings, shadows, sizes, typography } from "../shared/design-tokens";
import {
  ACCOUNT_ALIASES,
  normalizeAccountName,
  type QuickGuideOption,
  type QuickGuidePage,
  type QuickGuideTemplate,
} from "@rubydogjp/openkk-client-domain";
import {
  QuickGuidePanel,
  QuickGuideTriggerButton,
} from "./quick-guide-panel";
import type {
  EntryDraft,
  EntryMasterAccountOption,
  EntryMasterCategoryOption,
  EntrySuggestions,
} from "@rubydogjp/openkk-client-usecases";
import {
  parseAmount,
  getEntryLines,
  type EntryRecord,
  type EntryLine,
} from "@rubydogjp/openkk-client-domain";
import type { EntryAccountVisualType } from "@rubydogjp/openkk-client-domain";

const C = {
  text: palette.text,
  soft: palette.textSoft,
  muted: palette.textMuted,
  labelText: palette.textLabel,

  border: palette.borderStrong,

  panelBg: palette.surface,
  bg: palette.surface,
  blue: palette.brand,
  red: palette.danger,
  green: palette.success,
};

const ACC_PALETTE: Record<
  EntryAccountVisualType,
  { bg: string; fg: string; border: string }
> = {
  asset: { bg: palette.accountAssetBg, fg: palette.accountAsset, border: palette.accountAssetBorder },
  liability: { bg: palette.accountLiabilityBg, fg: palette.accountLiability, border: palette.accountLiabilityBorder },
  equity: { bg: palette.accountEquityBg, fg: palette.accountEquity, border: palette.accountEquityBorder },
  revenue: { bg: palette.accountRevenueBg, fg: palette.accountRevenue, border: palette.accountRevenueBorder },
  cost_of_sales: { bg: palette.accountExpenseBg, fg: palette.accountExpense, border: palette.accountExpenseBorder },
  expense: { bg: palette.accountExpenseBg, fg: palette.accountExpense, border: palette.accountExpenseBorder },
};

const ACC_TYPE_LABEL: Record<EntryAccountVisualType, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  cost_of_sales: "売上原価",
  expense: "費用",
};

const BIZ_RATE_PRESETS = ["100", "90", "80", "70", "60", "50", "40", "30", "20", "10", "0"];

export function EntryEditDrawer(props: {
  entry: EntryRecord;
  accountOptions: EntryMasterAccountOption[];
  taxCategoryOptions: EntryMasterCategoryOption[];
  businessCategoryOptions: EntryMasterCategoryOption[];
  suggestions: EntrySuggestions;
  mode?: "create" | "edit";
  onSave: (draft: EntryDraft) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const mode = props.mode ?? "edit";
  const [draft, setDraft] = useState<RowPairDraft>(() =>
    recordToRowPairDraft(props.entry),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [guideStack, setGuideStack] = useState<QuickGuidePage[]>([]);

  useEffect(() => {
    setDraft(recordToRowPairDraft(props.entry));
    setTriedSave(false);
    setErrorText(null);
  }, [props.entry]);

  const { onClose } = props;
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const update = (patch: Partial<RowPairDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const updateRow = (index: number, patch: Partial<RowPair>) => {
    setDraft((current) => ({
      ...current,
      pairs: current.pairs.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const addRow = () => {
    const defDebit =
      props.accountOptions.find((a) => a.accountType === "expense") ??
      props.accountOptions[0];
    const defCredit =
      props.accountOptions.find((a) => a.accountType === "asset") ??
      props.accountOptions[0];
    setDraft((current) => ({
      ...current,
      pairs: [
        ...current.pairs,
        {
          id: nextRowPairId(),
          debitAccountName: defDebit?.name ?? "",
          debitAccountType: defDebit?.accountType ?? "expense",
          debitAmount: "",
          creditAccountName: defCredit?.name ?? "",
          creditAccountType: defCredit?.accountType ?? "asset",
          creditAmount: "",
        },
      ],
    }));
  };

  const removeRow = (index: number) => {
    setDraft((current) => ({
      ...current,
      pairs: current.pairs.filter((_, i) => i !== index),
    }));
  };

  const openGuide = () => setGuideStack(["top"]);
  const closeGuide = () => setGuideStack([]);
  const pushGuide = (next: QuickGuidePage) =>
    setGuideStack((prev) => [...prev, next]);
  const popGuide = () =>
    setGuideStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)));

  const findAccountByName = (
    name: string,
  ): EntryMasterAccountOption | null => {
    const aliases = ACCOUNT_ALIASES[name] ?? [name];

    for (const alias of aliases) {
      const norm = normalizeAccountName(alias);
      const exact = props.accountOptions.find(
        (opt) => normalizeAccountName(opt.name) === norm,
      );
      if (exact != null) return exact;
    }

    for (const alias of aliases) {
      const norm = normalizeAccountName(alias);
      const partial = props.accountOptions.find((opt) =>
        normalizeAccountName(opt.name).includes(norm),
      );
      if (partial != null) return partial;
    }
    return null;
  };

  const applyGuideTemplate = (template: QuickGuideTemplate) => {
    const debit = findAccountByName(template.debitAccountName);
    const credit = findAccountByName(template.creditAccountName);
    if (debit == null || credit == null) {
      setErrorText(
        `勘定科目が見つかりません: ${
          debit == null ? template.debitAccountName : template.creditAccountName
        }`,
      );
      return;
    }
    setDraft((current) => {
      const newPair: RowPair = {
        id: nextRowPairId(),
        debitAccountName: debit.name,
        debitAccountType: debit.accountType,
        debitAmount: "",
        creditAccountName: credit.name,
        creditAccountType: credit.accountType,
        creditAmount: "",
      };
      const shouldSetDescription =
        template.description != null &&
        template.description.trim() !== "" &&
        current.description.trim() === "";
      const newDescription = shouldSetDescription
        ? template.description!.trim()
        : current.description;
      const newBusinessRate =
        template.businessRatePercent != null
          ? String(
              Math.max(0, Math.min(100, template.businessRatePercent)),
            )
          : current.businessRate;
      return {
        ...current,
        description: newDescription,
        businessRate: newBusinessRate,
        pairs: [newPair],
      };
    });
    setErrorText(null);
    closeGuide();
  };

  const handleGuideSelectOption = (option: QuickGuideOption) => {
    if (option.template != null) {
      applyGuideTemplate(option.template);
      return;
    }
    if (option.nextPage != null) {
      pushGuide(option.nextPage);
      return;
    }
    if (option.close === true) {
      closeGuide();
    }
  };

  const debitTotal = draft.pairs.reduce(
    (sum, row) => sum + parseAmount(row.debitAmount),
    0,
  );
  const creditTotal = draft.pairs.reduce(
    (sum, row) => sum + parseAmount(row.creditAmount),
    0,
  );
  const isBalanced = debitTotal === creditTotal && debitTotal > 0;
  const hasDescription = draft.description.trim().length > 0;
  const allRowsValid = draft.pairs.every((row) => {
    const hasDebit =
      row.debitAccountName.trim().length > 0 || parseAmount(row.debitAmount) > 0;
    const hasCredit =
      row.creditAccountName.trim().length > 0 || parseAmount(row.creditAmount) > 0;
    if (!hasDebit && !hasCredit) return false;
    const debitValid =
      !hasDebit ||
      (row.debitAccountName.trim().length > 0 && parseAmount(row.debitAmount) > 0);
    const creditValid =
      !hasCredit ||
      (row.creditAccountName.trim().length > 0 && parseAmount(row.creditAmount) > 0);
    return debitValid && creditValid;
  });

  const validationMessages: string[] = [];
  if (!hasDescription) validationMessages.push("摘要を入力してください。");
  if (!allRowsValid)
    validationMessages.push("入力した行の勘定科目と金額をすべて入力してください。");
  if (!isBalanced)
    validationMessages.push(
      `借方金額と貸方金額の合計を一致させてください。差額: ¥${Math.abs(
        debitTotal - creditTotal,
      ).toLocaleString()}`,
    );

  const handleSave = async () => {
    setTriedSave(true);
    if (validationMessages.length > 0) return;
    setSaving(true);
    setErrorText(null);
    try {
      await props.onSave(rowPairDraftToEntryDraft(draft, props.accountOptions));
    } catch {
      setErrorText("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (props.onDelete == null || deleting) return;
    setConfirmingDelete(false);
    setDeleting(true);
    setErrorText(null);
    try {
      await props.onDelete();
    } catch {
      setErrorText("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const footerMessages =
    triedSave && validationMessages.length > 0
      ? validationMessages
      : errorText != null
        ? [errorText]
        : [];

  return (
    <>

      <div
        onClick={props.onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 49,
          background: "transparent",
        }}
      />
      <aside
        role="dialog"
        aria-label={mode === "create" ? "仕訳の新規作成" : "仕訳の編集"}

        className="bk-entry-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: sizes.drawer.width,
          maxWidth: "100vw",
          background: C.panelBg,
          boxShadow: shadows.drawer,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "bk-drawer-slide-in 220ms cubic-bezier(0.2, 0, 0, 1)",
        }}

        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes bk-drawer-slide-in {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .bk-d-input { box-shadow: ${shadows.inputInset}; }
          .bk-d-input:focus { border-color: ${C.blue} !important; box-shadow: ${rings.brandFocus}, ${shadows.inputInset}; }
          .bk-d-menu-item { transition: background 80ms ease; }
          .bk-d-menu-item:hover { background: #F1F5F9; }
        `}</style>

        <header
          style={{
            height: 52,
            padding: "0 20px",
            background: C.bg,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: C.text }}>
            {mode === "create" ? "仕訳の新規作成" : "仕訳の編集"}
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={props.onClose}
            style={{
              width: 32,
              height: 32,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: C.soft,
              borderRadius: radii.sm,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <CloseIcon />
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px 20px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: palette.formGroupBg,
          }}
        >
          {guideStack.length > 0 ? (
            <QuickGuidePanel
              page={guideStack[guideStack.length - 1]!}
              canGoBack={guideStack.length > 1}
              onBack={popGuide}
              onClose={closeGuide}
              onSelectOption={handleGuideSelectOption}
            />
          ) : (
            <>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <QuickGuideTriggerButton onClick={openGuide} />
              </div>

          <StepFormRow
            label="日付"
            control={
              <DatePickerButton
                ariaLabel="日付"
                value={draft.date}
                onChange={(value) => update({ date: value })}
              />
            }
          />

          <div
            style={{
              background: C.bg,
              border: `1px solid ${palette.borderEmphasis}`,
              borderRadius: 12,
              flexShrink: 0,
            }}
          >
            {draft.pairs.map((row, index) => (
              <Fragment key={row.id}>
                {index > 0 ? <CardDivider /> : null}
                <div
                  style={{
                    padding: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      columnGap: 16,
                      rowGap: 12,
                    }}
                  >
                    <StackedField label="借方科目">
                      <AccountChip
                        ariaLabel="借方科目"
                        value={row.debitAccountName}
                        accountType={row.debitAccountType}
                        onChange={(option) =>
                          updateRow(index, {
                            debitAccountName: option.name,
                            debitAccountType: option.accountType,
                          })
                        }
                        options={props.accountOptions}

                        fullWidth
                      />
                    </StackedField>
                    <StackedField label="貸方科目">
                      <AccountChip
                        ariaLabel="貸方科目"
                        value={row.creditAccountName}
                        accountType={row.creditAccountType}
                        onChange={(option) =>
                          updateRow(index, {
                            creditAccountName: option.name,
                            creditAccountType: option.accountType,
                          })
                        }
                        options={props.accountOptions}
                        fullWidth
                      />
                    </StackedField>
                    <StackedField label="借方金額">
                      <AmountInput
                        value={row.debitAmount}
                        onChange={(value) =>
                          updateRow(index, { debitAmount: value })
                        }
                      />
                    </StackedField>
                    <StackedField label="貸方金額">
                      <AmountInput
                        value={row.creditAmount}
                        onChange={(value) =>
                          updateRow(index, { creditAmount: value })
                        }
                      />
                    </StackedField>
                  </div>

                  <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
                    <ActionRowButton
                      variant="delete"
                      ariaLabel="この行を削除"
                      enabled={draft.pairs.length > 1}
                      onClick={() => removeRow(index)}
                    />
                  </div>
                </div>
              </Fragment>
            ))}
            <CardDivider />

            <div style={{ padding: 18, display: "flex", justifyContent: "flex-end" }}>
              <ActionRowButton
                variant="add"
                ariaLabel="複合仕訳を追加"
                label="複合仕訳を追加"
                enabled
                onClick={addRow}
              />
            </div>
          </div>

          <StepFormRow
            label="摘要"
            control={
              <div style={{ width: 320, maxWidth: "100%" }}>
                <PlainInput
                  ariaLabel="摘要"
                  value={draft.description}
                  onChange={(value) => update({ description: value })}
                />
              </div>
            }
          />
          <StepFormRow
            label="取引先"
            control={
              <div style={{ width: 200, maxWidth: "100%" }}>
                <FreeformChip
                  value={draft.partner}
                  onChange={(value) => update({ partner: value })}
                  options={mergeOptions([], props.suggestions.partner)}
                  placeholder="取引先を入力"
                />
              </div>
            }
          />
          <StepFormRow
            label="事業割合 (%)"
            control={
              <div style={{ width: 120 }}>
                <FreeformChip
                  value={draft.businessRate}
                  onChange={(next) => {
                    const n = parseInt(next, 10);
                    if (Number.isNaN(n)) update({ businessRate: next.trim() });
                    else
                      update({
                        businessRate: String(Math.max(0, Math.min(100, n))),
                      });
                  }}
                  options={BIZ_RATE_PRESETS}
                  placeholder="100"
                  align="right"
                  numeric
                />
              </div>
            }
          />
          <StepFormRow
            label="課税区分"
            control={
              <div style={{ width: 120 }}>
                <FreeformChip
                  value={draft.taxCategory}
                  onChange={(value) => update({ taxCategory: value })}
                  options={mergeOptions(
                    props.taxCategoryOptions.map((o) => o.name),
                    props.suggestions.taxCategory,
                  )}
                  placeholder="未選択"
                />
              </div>
            }
          />
          <StepFormRow
            label="事業区分"
            control={
              <div style={{ width: 120 }}>
                <FreeformChip
                  value={draft.businessCategory}
                  onChange={(value) => update({ businessCategory: value })}
                  options={mergeOptions(
                    props.businessCategoryOptions.map((o) => o.name),
                    props.suggestions.businessCategory,
                  )}
                  placeholder="未選択"
                />
              </div>
            }
          />
            </>
          )}
        </div>

        <footer
          style={{
            padding: footerMessages.length > 0 ? "12px 20px 16px" : "16px 20px",
            borderTop: `1px solid ${C.border}`,
            background: C.bg,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {footerMessages.length > 0 ? (
            <ValidationCard messages={footerMessages} compact />
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
            }}
          >
            {mode === "edit" && props.onDelete != null ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting || saving}
                style={{
                  ...deleteEntryButtonStyle,
                  opacity: deleting || saving ? 0.5 : 1,
                  cursor: deleting || saving ? "default" : "pointer",
                }}
              >
                {deleting ? "削除中…" : "削除"}
              </button>
            ) : (
              <BalanceIndicator debitAmt={debitTotal} creditAmt={creditTotal} />
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={props.onClose} style={secondaryButtonStyle}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving || deleting ? 0.5 : 1,
                  cursor: saving || deleting ? "default" : "pointer",
                }}
              >
                {saving ? "保存中…" : mode === "create" ? "作成" : "保存"}
              </button>
            </div>
          </div>
        </footer>
        {confirmingDelete ? (
          <DeleteConfirmDialog
            deleting={deleting}
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={handleDelete}
          />
        ) : null}
      </aside>
    </>
  );
}

function CardDivider() {
  return <div style={{ height: 1, background: palette.borderSubtle }} />;
}

function StackedField({
  label,
  width,
  children,
}: {
  label: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        width: width ?? "100%",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          marginBottom: 8,
          fontSize: fontSize.base,
          fontWeight: fontWeight.semibold,
          color: C.labelText,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function AccountChip({
  value,
  accountType,
  onChange,
  options,
  fullWidth = false,
  ariaLabel,
}: {
  value: string;
  accountType: EntryAccountVisualType;
  onChange: (option: EntryMasterAccountOption) => void;
  options: EntryMasterAccountOption[];

  fullWidth?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useOutsideClose(open, () => setOpen(false));

  const grouped = useMemo(() => groupAccounts(options, query), [options, query]);
  const palette = ACC_PALETTE[accountType];
  const bg = value === "" ? C.bg : palette.bg;
  const fg = value === "" ? C.muted : palette.fg;
  const border = value === "" ? C.border : palette.fg;

  return (
    <div
      ref={ref}
      style={{ position: "relative", width: fullWidth ? "100%" : undefined }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{
          height: sizes.account.tableHeight,
          width: fullWidth ? "100%" : sizes.account.tableWidth,
          boxSizing: "border-box",
          border: `1px solid ${border}`,
          borderRadius: radii.sm,
          background: bg,
          padding: "0 11px",
          fontSize: fontSize.base,
          color: fg,
          fontWeight: fontWeight.bold,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {value === "" ? null : <AccountTypeIcon type={accountType} color={palette.fg} size={16} />}
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value === "" ? "勘定科目を選択" : value}
        </span>
      </button>
      {open ? (
        <div style={popupStyle}>
          <div style={{ padding: 8, borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              className="bk-d-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="勘定科目を検索"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 30,
                padding: "0 10px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: fontSize.sm,
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", padding: "4px 0" }}>
            {grouped.length === 0 ? (
              <EmptyHint>該当する科目がありません</EmptyHint>
            ) : (
              grouped.map((group) => (
                <div key={group.type}>
                  <SectionLabel>{ACC_TYPE_LABEL[group.type]}</SectionLabel>
                  {group.accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      className="bk-d-menu-item"
                      onClick={() => {
                        onChange(account);
                        setOpen(false);
                        setQuery("");
                      }}
                      style={menuItemStyle}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: ACC_PALETTE[account.accountType].fg,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: account.name === value ? fontWeight.bold : fontWeight.medium }}>
                        {account.name}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountTypeIcon(props: { type: EntryAccountVisualType; color: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: props.size,
        height: props.size,
        display: "block",
        flexShrink: 0,
        backgroundColor: props.color,
        maskImage: `url('${accountIconPath(props.type)}')`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url('${accountIconPath(props.type)}')`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function accountIconPath(type: EntryAccountVisualType): string {
  switch (type) {
    case "asset":
      return "/icons/assets.svg";
    case "liability":
      return "/icons/liabilities.svg";
    case "equity":
      return "/icons/net-assets.svg";
    case "revenue":
      return "/icons/revenue.svg";
    case "cost_of_sales":
    case "expense":
      return "/icons/expense.svg";
  }
}

function groupAccounts(
  options: EntryMasterAccountOption[],
  query: string,
): Array<{ type: EntryAccountVisualType; accounts: EntryMasterAccountOption[] }> {
  const order: EntryAccountVisualType[] = [
    "asset",
    "liability",
    "equity",
    "revenue",
    "cost_of_sales",
    "expense",
  ];
  const lower = query.trim().toLowerCase();
  const filtered =
    lower === ""
      ? options
      : options.filter((option) => option.name.toLowerCase().includes(lower));
  return order
    .map((type) => ({
      type,
      accounts: filtered.filter((option) => option.accountType === type),
    }))
    .filter((group) => group.accounts.length > 0);
}

function FreeformChip({
  value,
  onChange,
  options,
  placeholder,
  align = "left",
  numeric = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  align?: "left" | "right";
  numeric?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useOutsideClose(open, () => setOpen(false));

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return options;
    return options.filter((option) => option.toLowerCase().includes(trimmed));
  }, [options, query]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          height: 30,
          width: "100%",
          boxSizing: "border-box",
          border: `1px solid ${value === "" ? C.border : C.blue}`,
          borderRadius: 999,
          background: C.bg,
          padding: "0 10px",
          fontSize: fontSize.sm,
          color: value === "" ? C.muted : C.blue,
          fontWeight: fontWeight.regular,
          textAlign: align,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: align === "right" ? "flex-end" : "flex-start",
          fontVariantNumeric: numeric ? "tabular-nums" : undefined,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
            textAlign: align,
          }}
        >
          {value === "" ? placeholder ?? "選択" : value}
        </span>
      </button>
      {open ? (
        <div style={popupStyle}>
          <div
            style={{
              padding: 8,
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              autoFocus
              className="bk-d-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit(query.trim());
                }
              }}
              inputMode={numeric ? "numeric" : undefined}
              placeholder={placeholder ?? "入力 / 検索"}
              style={{
                flex: 1,
                height: 30,
                padding: "0 10px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: fontSize.sm,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => commit(query.trim())}
              aria-label="この値で確定"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: "none",
                background: C.green,
                color: "#FFFFFF",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckIcon />
            </button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", padding: "4px 0" }}>
            {filtered.length === 0 ? (
              <EmptyHint>
                候補はありません。
                <br />
                入力した値をそのまま保存できます。
              </EmptyHint>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="bk-d-menu-item"
                  onClick={() => commit(option)}
                  style={{
                    ...menuItemStyle,
                    fontWeight: option === value ? fontWeight.bold : fontWeight.medium,
                  }}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlainInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      className="bk-d-input"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        height: sizes.field.height,
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${C.border}`,
        borderRadius: radii.sm,
        background: C.bg,
        padding: `0 ${sizes.field.paddingX}px`,
        ...typography.input,
        color: C.text,
        outline: "none",
      }}
    />
  );
}

function BalanceIndicator({
  debitAmt,
  creditAmt,
}: {
  debitAmt: number;
  creditAmt: number;
}) {
  if (debitAmt === 0 && creditAmt === 0) {
    return (
      <div style={{ fontSize: fontSize.sm, color: C.muted, fontWeight: fontWeight.semibold }}>
        金額を入力してください
      </div>
    );
  }
  if (debitAmt === creditAmt) {
    return (
      <div
        style={{
          fontSize: fontSize.sm,
          color: C.green,
          fontWeight: fontWeight.bold,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <CheckIcon /> 貸借一致 ¥{debitAmt.toLocaleString()}
      </div>
    );
  }
  return (
    <div
      style={{
        fontSize: fontSize.sm,
        color: C.red,
        fontWeight: fontWeight.bold,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <WarnIcon /> 差額 ¥{Math.abs(debitAmt - creditAmt).toLocaleString()}
    </div>
  );
}

function ValidationCard({
  messages,
  compact = false,
}: {
  messages: string[];
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: compact ? radii.sm : 12,
        border: `1px solid ${C.red}2E`,
        background: `${C.red}0D`,
        padding: compact ? "10px 12px" : "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 8,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: compact ? fontSize.sm : fontSize.base,
          fontWeight: fontWeight.bold,
          color: C.red,
        }}
      >
        <WarnIcon /> 入力内容を確認してください
      </div>
      {messages.map((message, index) => (
        <div
          key={index}
          style={{
            paddingLeft: 22,
            fontSize: fontSize.sm,
            color: C.text,
            lineHeight: compact ? 1.45 : 1.6,
          }}
        >
          ・{message}
        </div>
      ))}
    </div>
  );
}

function DeleteConfirmDialog(props: {
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="presentation"
      onClick={props.onCancel}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        background: "rgba(15, 23, 42, 0.24)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="仕訳の削除確認"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: radii.md,
          border: `1px solid ${palette.borderStrong}`,
          background: palette.surface,
          boxShadow: shadows.popup,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: C.text,
          }}
        >
          仕訳を削除しますか
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: fontSize.sm,
            lineHeight: 1.7,
            color: C.soft,
          }}
        >
          この操作は取り消せません。
        </div>
        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.deleting}
            style={{
              ...secondaryButtonStyle,
              opacity: props.deleting ? 0.5 : 1,
              cursor: props.deleting ? "default" : "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.deleting}
            style={{
              ...deleteEntryButtonStyle,
              background: C.red,
              color: palette.surface,
              opacity: props.deleting ? 0.5 : 1,
              cursor: props.deleting ? "default" : "pointer",
            }}
          >
            {props.deleting ? "削除中…" : "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);
  return ref;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "6px 14px 4px",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        letterSpacing: "0.06em",
        color: C.muted,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        fontSize: fontSize.sm,
        color: C.muted,
        textAlign: "center",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

const menuItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: "8px 14px",
  fontSize: fontSize.base,
  color: C.text,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const popupStyle: CSSProperties = {
  position: "absolute",
  top: 40,
  left: 0,
  right: 0,
  zIndex: 60,
  minWidth: 220,
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: radii.md,
  boxShadow: shadows.popup,
  overflow: "hidden",
};

const secondaryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: `1px solid ${C.border}`,
  background: C.bg,
  color: C.text,
  ...typography.control,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formPrimaryMinWidth,
  padding: "0 18px",
  borderRadius: radii.sm,
  border: "none",
  background: C.blue,
  color: "#FFFFFF",
  ...typography.control,
  fontWeight: fontWeight.bold,
  boxShadow: shadows.primaryButton,
};

const deleteEntryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: `1px solid ${palette.dangerBorder}`,
  background: palette.surface,
  color: C.red,
  ...typography.control,
  fontWeight: fontWeight.bold,
};

function ActionRowButton({
  variant,
  ariaLabel,
  label,
  enabled,
  onClick,
}: {
  variant: "add" | "delete";
  ariaLabel: string;
  label?: string;
  enabled: boolean;
  onClick: () => void;
}) {
  const baseColor = variant === "add" ? palette.success : C.red;
  const color = enabled ? baseColor : C.muted;
  const hasLabel = label != null && label !== "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: enabled ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: `1.5px solid ${color}`,
          background: C.bg,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {variant === "add" ? <PlusIcon /> : <MinusIcon />}
      </span>
      {hasLabel ? (
        <span
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            color,
          }}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <polyline points="5 12 10 17 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l10 18H2L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="12" y1="10" x2="12" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

type RowPair = {
  id: string;
  debitAccountName: string;
  debitAccountType: EntryAccountVisualType;
  debitAmount: string;
  creditAccountName: string;
  creditAccountType: EntryAccountVisualType;
  creditAmount: string;
};

// Stable per-row key so removing a middle row doesn't shift other rows'
// internal state (open dropdowns, focus) onto their neighbours.
let rowPairKeySeq = 0;
function nextRowPairId(): string {
  rowPairKeySeq += 1;
  return `row-${rowPairKeySeq}`;
}

type RowPairDraft = {
  date: string;
  description: string;
  partner: string;
  businessRate: string;
  taxCategory: string;
  businessCategory: string;
  pairs: RowPair[];
};

function recordToRowPairDraft(record: EntryRecord): RowPairDraft {
  const lines = getEntryLines(record);
  const debits = lines.filter((line) => line.side === "debit");
  const credits = lines.filter((line) => line.side === "credit");
  const rowCount = Math.max(debits.length, credits.length, 1);
  const pairs: RowPair[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const debit = debits[i] ?? null;
    const credit = credits[i] ?? null;
    pairs.push({
      id: nextRowPairId(),
      debitAccountName: debit?.accountName ?? "",
      debitAccountType: debit?.accountType ?? "expense",
      debitAmount: debit?.amount ?? "",
      creditAccountName: credit?.accountName ?? "",
      creditAccountType: credit?.accountType ?? "asset",
      creditAmount: credit?.amount ?? "",
    });
  }
  return {
    date: record.date,
    description: record.description,
    partner: record.partner,
    businessRate: record.businessRate,
    taxCategory: record.taxCategory,
    businessCategory: record.businessCategory,
    pairs,
  };
}

function rowPairDraftToEntryDraft(
  draft: RowPairDraft,
  accounts: EntryMasterAccountOption[],
): EntryDraft {
  const lines: EntryLine[] = [];
  for (const pair of draft.pairs) {
    if (pair.debitAccountName.trim().length > 0 && parseAmount(pair.debitAmount) > 0) {
      const matched = accounts.find((a) => a.name === pair.debitAccountName);
      lines.push({
        side: "debit",
        accountName: pair.debitAccountName,
        accountType: pair.debitAccountType,
        amount: pair.debitAmount,
        bookAccountId: matched?.id,
      });
    }
    if (pair.creditAccountName.trim().length > 0 && parseAmount(pair.creditAmount) > 0) {
      const matched = accounts.find((a) => a.name === pair.creditAccountName);
      lines.push({
        side: "credit",
        accountName: pair.creditAccountName,
        accountType: pair.creditAccountType,
        amount: pair.creditAmount,
        bookAccountId: matched?.id,
      });
    }
  }
  return {
    date: draft.date,
    description: draft.description,
    partner: draft.partner,
    businessRate: draft.businessRate,
    taxCategory: draft.taxCategory,
    businessCategory: draft.businessCategory,
    lines,
  };
}

function mergeOptions(primary: Iterable<string>, secondary: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...primary, ...secondary]) {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
