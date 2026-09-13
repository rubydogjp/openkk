"use client";

import { Fragment, useRef, useState } from "react";

import { StepFormRow } from "../steps/step-ui.js";
import { AmountInput } from "../shared/amount-field.js";
import { DatePickerButton } from "../shared/date-picker.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { useModalLifecycle } from "../shared/dismissible-layer.js";
import { debugAppError } from "../shared/app-error-text.js";
import { safeUserErrorMessage } from "../shared/safe-error-message.js";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  rings,
  shadows,
  sizes,
} from "../shared/design-tokens.js";
import {
  resolveGuideBookAccount,
  type QuickGuideOption,
  type QuickGuidePage,
  mergeOptions,
  type QuickGuideTemplate,
} from "@rubydogjp/openkk-client-domain";
import { QuickGuidePanel, QuickGuideTriggerButton } from "./quick-guide-panel.js";
import {
  entryFormStateToEntryDraft,
  entryToFormState,
  type EntryFormState,
  type EntryLinePair,
} from "./entry-edit-model.js";
import {
  AccountPicker,
  ActionRowButton,
  BalanceIndicator,
  CardDivider,
  CloseIcon,
  DeleteConfirmDialog,
  SuggestionInput,
  TextFieldInput,
  StackedField,
  ValidationCard,
  deleteEntryButtonStyle,
  entryDrawerColors,
  primaryButtonStyle,
  secondaryButtonStyle,
} from "./entry-edit-controls.js";
import type {
  EntryDraft,
  EntryMasterAccountOption,
  EntryMasterCategoryOption,
  EntrySuggestions,
} from "@rubydogjp/openkk-client-usecases";
import {
  MAX_ENTRY_LINES,
  parseAmount,
} from "@rubydogjp/openkk-client-domain";
import {
  validateEntryAmounts,
  validateBusinessRate,
  validateEntryDate,
  validateEntryLineCount,
} from "./entry-edit-validation.js";

const BIZ_RATE_PRESETS = [
  "100",
  "90",
  "80",
  "70",
  "60",
  "50",
  "40",
  "30",
  "20",
  "10",
  "0",
];

export function EntryEditDrawer(props: {
  entry: EntryDraft;
  accountOptions: EntryMasterAccountOption[];
  taxCategoryOptions: EntryMasterCategoryOption[];
  businessCategoryOptions: EntryMasterCategoryOption[];
  suggestions: EntrySuggestions;
  mode: "create" | "edit";
  minDate: string | null;
  maxDate: string | null;
  onSave: (draft: EntryDraft) => Promise<void> | void;
  onDelete: (() => Promise<void> | void) | null;
  onClose: () => void;
}) {
  const linePairIdSequence = useRef(0);
  const nextLinePairId = () => {
    linePairIdSequence.current += 1;
    return `row-${linePairIdSequence.current}`;
  };
  const [draft, setDraft] = useState<EntryFormState>(() =>
    entryToFormState(props.entry, nextLinePairId),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const mutationLock = useRef(new ExclusiveActionLock());

  const [guideStack, setGuideStack] = useState<QuickGuidePage[]>([]);

  const drawerRef = useModalLifecycle<HTMLElement>(() => {
    if (!mutationLock.current.isLocked) props.onClose();
  }, null);

  const update = (patch: Partial<EntryFormState>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const updatePartner = (value: string) =>
    setDraft((current) => ({
      ...current,
      partner: value,
      pairs: current.pairs.map((row) => ({
        ...row,
        debitPartnerName: null,
        creditPartnerName: null,
      })),
    }));

  const updateTaxCategory = (value: string) =>
    setDraft((current) => ({
      ...current,
      taxCategory: value,
      pairs: current.pairs.map((row) => ({
        ...row,
        debitTaxCategoryId: null,
        creditTaxCategoryId: null,
      })),
    }));

  const updateBusinessCategory = (value: string) =>
    setDraft((current) => ({
      ...current,
      businessCategory: value,
      pairs: current.pairs.map((row) => ({
        ...row,
        debitBusinessCategoryId: null,
        creditBusinessCategoryId: null,
      })),
    }));

  const updateRow = (index: number, patch: Partial<EntryLinePair>) => {
    setDraft((current) => ({
      ...current,
      pairs: current.pairs.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addRow = () => {
    const defDebit =
      props.accountOptions.find((a) => a.accountType === "expense") ??
      props.accountOptions[0] ?? null;
    const defCredit =
      props.accountOptions.find((a) => a.accountType === "asset") ??
      props.accountOptions[0] ?? null;
    setDraft((current) => ({
      ...current,
      pairs: [
        ...current.pairs,
        {
          id: nextLinePairId(),
          debitAccountId: defDebit?.id ?? null,
          debitAccountName: defDebit?.name ?? "",
          debitAccountType: defDebit?.accountType ?? "expense",
          debitAmount: "",
          creditAccountId: defCredit?.id ?? null,
          creditAccountName: defCredit?.name ?? "",
          creditAccountType: defCredit?.accountType ?? "asset",
          creditAmount: "",
          debitPartnerName: null,
          debitTaxCategoryId: null,
          debitBusinessCategoryId: null,
          creditPartnerName: null,
          creditTaxCategoryId: null,
          creditBusinessCategoryId: null,
          debitLineId: null,
          creditLineId: null,
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

  const findAccountByName = (name: string): EntryMasterAccountOption | null =>
    resolveGuideBookAccount(name, props.accountOptions);

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
      const newPair: EntryLinePair = {
        id: nextLinePairId(),
        debitAccountId: debit.id,
        debitAccountName: debit.name,
        debitAccountType: debit.accountType,
        debitAmount: "",
        creditAccountId: credit.id,
        creditAccountName: credit.name,
        creditAccountType: credit.accountType,
        creditAmount: "",
        debitPartnerName: null,
        debitTaxCategoryId: null,
        debitBusinessCategoryId: null,
        creditPartnerName: null,
        creditTaxCategoryId: null,
        creditBusinessCategoryId: null,
        debitLineId: null,
        creditLineId: null,
      };
      const templateDescription = template.description?.trim() ?? "";
      const shouldSetDescription =
        templateDescription !== "" && current.description.trim() === "";
      const newDescription = shouldSetDescription
        ? templateDescription
        : current.description;
      const templateRatePercent = template.businessRatePercent;
      return {
        ...current,
        description: newDescription,
        businessRateInput:
          templateRatePercent == null
            ? current.businessRateInput
            : String(Math.max(0, Math.min(100, templateRatePercent))),
        businessRate: templateRatePercent == null ? current.businessRate : null,
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
    if (option.close) {
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
  const isBalanced =
    Number.isSafeInteger(debitTotal) &&
    Number.isSafeInteger(creditTotal) &&
    debitTotal === creditTotal &&
    debitTotal > 0;
  const hasDescription = draft.description.trim().length > 0;
  const allRowsValid = draft.pairs.every((row) => {
    const hasDebit =
      row.debitAccountName.trim().length > 0 ||
      parseAmount(row.debitAmount) > 0;
    const hasCredit =
      row.creditAccountName.trim().length > 0 ||
      parseAmount(row.creditAmount) > 0;
    if (!hasDebit && !hasCredit) return false;
    const debitValid =
      !hasDebit ||
      (row.debitAccountName.trim().length > 0 &&
        parseAmount(row.debitAmount) > 0);
    const creditValid =
      !hasCredit ||
      (row.creditAccountName.trim().length > 0 &&
        parseAmount(row.creditAmount) > 0);
    return debitValid && creditValid;
  });

  const validationMessages: string[] = [];
  const dateValidationMessage = validateEntryDate(
    draft.date,
    props.minDate,
    props.maxDate,
  );
  if (dateValidationMessage != null)
    validationMessages.push(dateValidationMessage);
  const amountValidationMessage = validateEntryAmounts(
    draft.pairs.map((row) => row.debitAmount),
    draft.pairs.map((row) => row.creditAmount),
  );
  if (amountValidationMessage != null)
    validationMessages.push(amountValidationMessage);
  const businessRateValidationMessage = validateBusinessRate(
    draft.businessRateInput,
  );
  if (businessRateValidationMessage != null) {
    validationMessages.push(businessRateValidationMessage);
  }
  const entryLineCount = draft.pairs.reduce(
    (count, row) =>
      count +
      (parseAmount(row.debitAmount) > 0 ? 1 : 0) +
      (parseAmount(row.creditAmount) > 0 ? 1 : 0),
    0,
  );
  const lineCountValidationMessage = validateEntryLineCount(entryLineCount);
  if (lineCountValidationMessage != null)
    validationMessages.push(lineCountValidationMessage);
  if (!hasDescription) validationMessages.push("摘要を入力してください。");
  if (!allRowsValid)
    validationMessages.push(
      "入力した行の勘定科目と金額をすべて入力してください。",
    );
  if (!isBalanced && amountValidationMessage == null)
    validationMessages.push(
      `借方金額と貸方金額の合計を一致させてください。差額: ¥${Math.abs(
        debitTotal - creditTotal,
      ).toLocaleString()}`,
    );

  const handleSave = async () => {
    setTriedSave(true);
    if (validationMessages.length > 0) return;
    const release = mutationLock.current.tryAcquire();
    if (release == null) return;
    setSaving(true);
    setErrorText(null);
    try {
      await props.onSave(entryFormStateToEntryDraft(draft, props.accountOptions));
    } catch (error) {
      debugAppError(error);
      setErrorText(safeUserErrorMessage(error, "保存に失敗しました"));
    } finally {
      setSaving(false);
      release();
    }
  };

  const handleDelete = async () => {
    if (props.onDelete == null) return;
    const release = mutationLock.current.tryAcquire();
    if (release == null) return;
    setConfirmingDelete(false);
    setDeleting(true);
    setErrorText(null);
    try {
      await props.onDelete();
    } catch (error) {
      debugAppError(error);
      setErrorText(safeUserErrorMessage(error, "削除に失敗しました"));
    } finally {
      setDeleting(false);
      release();
    }
  };

  const requestClose = () => {
    if (!mutationLock.current.isLocked) props.onClose();
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
        onClick={requestClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 49,
          background: "transparent",
        }}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          props.mode === "create" ? "仕訳の新規作成" : "仕訳の編集"
        }
        tabIndex={-1}
        className="bk-entry-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: sizes.drawer.width,
          maxWidth: "100vw",
          background: entryDrawerColors.panelBg,
          boxShadow: shadows.drawer,
          borderLeft: `1px solid ${entryDrawerColors.border}`,
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
          .bk-d-input:focus {
            border-color: ${entryDrawerColors.blue} !important;
            box-shadow: ${rings.brandFocus}, ${shadows.inputInset};
          }
          .bk-d-menu-item { transition: background 80ms ease; }
          .bk-d-menu-item:hover { background: #F1F5F9; }
        `}</style>

        <header
          style={{
            height: 52,
            padding: "0 20px",
            background: entryDrawerColors.bg,
            borderBottom: `1px solid ${entryDrawerColors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: entryDrawerColors.text,
            }}
          >
            {props.mode === "create" ? "仕訳の新規作成" : "仕訳の編集"}
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={requestClose}
            disabled={saving || deleting}
            style={{
              width: 32,
              height: 32,
              border: "none",
              background: "transparent",
              cursor: saving || deleting ? "default" : "pointer",
              opacity: saving || deleting ? 0.5 : 1,
              color: entryDrawerColors.soft,
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
                    minDate={props.minDate}
                    maxDate={props.maxDate}
                    onChange={(value) => update({ date: value })}
                  />
                }
                hint={null}
                divider={false}
              />

              <div
                style={{
                  background: entryDrawerColors.bg,
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
                        <StackedField label="借方科目" width={null}>
                          <AccountPicker
                            ariaLabel="借方科目"
                            selectedId={row.debitAccountId}
                            value={row.debitAccountName}
                            accountType={row.debitAccountType}
                            onChange={(option) =>
                              updateRow(index, {
                                debitAccountId: option.id,
                                debitAccountName: option.name,
                                debitAccountType: option.accountType,
                              })
                            }
                            options={props.accountOptions}
                            fullWidth
                          />
                        </StackedField>
                        <StackedField label="貸方科目" width={null}>
                          <AccountPicker
                            ariaLabel="貸方科目"
                            selectedId={row.creditAccountId}
                            value={row.creditAccountName}
                            accountType={row.creditAccountType}
                            onChange={(option) =>
                              updateRow(index, {
                                creditAccountId: option.id,
                                creditAccountName: option.name,
                                creditAccountType: option.accountType,
                              })
                            }
                            options={props.accountOptions}
                            fullWidth
                          />
                        </StackedField>
                        <StackedField label="借方金額" width={null}>
                          <AmountInput
                            value={row.debitAmount}
                            onChange={(value) =>
                              updateRow(index, { debitAmount: value })
                            }
                            ariaLabel={null}
                          />
                        </StackedField>
                        <StackedField label="貸方金額" width={null}>
                          <AmountInput
                            value={row.creditAmount}
                            onChange={(value) =>
                              updateRow(index, { creditAmount: value })
                            }
                            ariaLabel={null}
                          />
                        </StackedField>
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <ActionRowButton
                          variant="delete"
                          ariaLabel="この行を削除"
                          enabled={draft.pairs.length > 1}
                          onClick={() => removeRow(index)}
                          label={null}
                        />
                      </div>
                    </div>
                  </Fragment>
                ))}
                <CardDivider />

                <div
                  style={{
                    padding: 18,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <ActionRowButton
                    variant="add"
                    ariaLabel="複合仕訳を追加"
                    label="複合仕訳を追加"
                    enabled={draft.pairs.length < MAX_ENTRY_LINES / 2}
                    onClick={addRow}
                  />
                </div>
              </div>

              <StepFormRow
                label="摘要"
                control={
                  <div style={{ width: 320, maxWidth: "100%" }}>
                    <TextFieldInput
                      ariaLabel="摘要"
                      value={draft.description}
                      onChange={(value) => update({ description: value })}
                    />
                  </div>
                }
                hint={null}
                divider={false}
              />
              <StepFormRow
                label="取引先"
                control={
                  <div style={{ width: 200, maxWidth: "100%" }}>
                    <SuggestionInput
                      value={draft.partner}
                      onChange={updatePartner}
                      options={mergeOptions([], props.suggestions.partner)}
                      ariaLabel="取引先"
                      placeholder="取引先を入力"
                      align={null}
                      inputMode={null}
                    />
                  </div>
                }
                hint={null}
                divider={false}
              />
              <StepFormRow
                label="事業割合 (%)"
                control={
                  <div style={{ width: 120 }}>
                    <SuggestionInput
                      value={draft.businessRateInput}
                      onChange={(next) =>
                        update({
                          businessRateInput: next.trim(),
                          businessRate: null,
                        })
                      }
                      options={BIZ_RATE_PRESETS}
                      ariaLabel="事業割合 (%)"
                      placeholder="100"
                      align="right"
                      inputMode="decimal"
                    />
                  </div>
                }
                hint={null}
                divider={false}
              />
              <StepFormRow
                label="課税区分"
                control={
                  <div style={{ width: 120 }}>
                    <SuggestionInput
                      value={draft.taxCategory}
                      onChange={updateTaxCategory}
                      options={mergeOptions(
                        props.taxCategoryOptions.map((o) => o.name),
                        props.suggestions.taxCategory,
                      )}
                      ariaLabel="課税区分"
                      placeholder="未選択"
                      align={null}
                      inputMode={null}
                    />
                  </div>
                }
                hint={null}
                divider={false}
              />
              <StepFormRow
                label="事業区分"
                control={
                  <div style={{ width: 120 }}>
                    <SuggestionInput
                      value={draft.businessCategory}
                      onChange={updateBusinessCategory}
                      options={mergeOptions(
                        props.businessCategoryOptions.map((o) => o.name),
                        props.suggestions.businessCategory,
                      )}
                      ariaLabel="事業区分"
                      placeholder="未選択"
                      align={null}
                      inputMode={null}
                    />
                  </div>
                }
                hint={null}
                divider={false}
              />
            </>
          )}
        </div>

        <footer
          style={{
            padding: footerMessages.length > 0 ? "12px 20px 16px" : "16px 20px",
            borderTop: `1px solid ${entryDrawerColors.border}`,
            background: entryDrawerColors.bg,
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
          {props.mode === "edit" && props.onDelete != null ? (
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
              <button
                type="button"
                onClick={requestClose}
                disabled={saving || deleting}
                style={{
                  ...secondaryButtonStyle,
                  opacity: saving || deleting ? 0.5 : 1,
                  cursor: saving || deleting ? "default" : "pointer",
                }}
              >
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
                {saving
                  ? "保存中…"
                  : props.mode === "create"
                    ? "作成"
                    : "保存"}
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
