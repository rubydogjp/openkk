"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { StepFormRow } from "../steps/step-ui.js";
import { AmountInput } from "../shared/amount-field.js";
import { DatePickerButton } from "../shared/date-picker.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { useModalLifecycle } from "../shared/dismissible-layer.js";
import { useConfirmDialog } from "../shared/confirm-dialog.js";
import {
  DRAWER_SLIDE_IN_ANIMATION,
  DRAWER_SLIDE_IN_KEYFRAMES,
} from "../shared/drawer-frame.js";
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
  entryLineValueDifferences,
  resolveGuideBookAccount,
  type QuickGuideOption,
  type QuickGuidePage,
  type QuickGuideTemplate,
  MAX_ENTRY_LINES,
  formatAmount,
  parseAmount,
} from "@rubydogjp/openkk-driver";
import {
  QuickGuidePanel,
  QuickGuideTriggerButton,
} from "./quick-guide-panel.js";
import {
  entryFormStateToEntryDraft,
  entryToFormState,
  newEntryLinePair,
  type EntryFormState,
  type EntryLinePair,
} from "./entry-edit-model.js";
import {
  AccountPicker,
  ActionRowButton,
  BalanceIndicator,
  CardDivider,
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
import { CloseIcon } from "../shared/icons.js";
import type {
  EntrySharedLineField,
  EntryDraft,
  EntryMasterAccountOption,
  EntryMasterCategoryOption,
  EntrySuggestions,
} from "@rubydogjp/openkk-driver";
import {
  validateEntryAmounts,
  validateBusinessRate,
  validateEntryDate,
  validateEntryLineCount,
} from "./entry-edit-validation.js";

const BUSINESS_RATE_PRESETS = [
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

function lineValueDifferencesMessage(
  fields: readonly EntrySharedLineField[],
): string {
  return `この仕訳は、行ごとに${fields.join("・")}が違います。保存すると、どの行もここの値にそろいます。`;
}

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
  const [storedLineValueDifferences] = useState(() =>
    entryLineValueDifferences(props.entry),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const mutationLock = useRef(new ExclusiveActionLock());

  const [guideStack, setGuideStack] = useState<QuickGuidePage[]>([]);

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [initialDraftText] = useState(() => JSON.stringify(draft));
  const hasEnteredLines =
    props.mode === "edit" ||
    draft.pairs.length > 1 ||
    draft.pairs.some(
      (pair) =>
        pair.debitAmount.trim() !== "" || pair.creditAmount.trim() !== "",
    );

  const requestClose = () => {
    if (!mutationLock.current.isLocked) props.onClose();
  };
  const requestDismiss = () => {
    if (mutationLock.current.isLocked) return;
    if (JSON.stringify(draft) === initialDraftText) {
      props.onClose();
      return;
    }
    void confirm({
      tone: "danger",
      title: "入力の破棄",
      body: ["入力した内容は保存されません。"],
      confirmLabel: "破棄する",
    }).then((confirmed) => {
      if (confirmed && !mutationLock.current.isLocked) props.onClose();
    });
  };
  const drawerRef = useModalLifecycle<HTMLElement>(requestDismiss, null);

  const update = (patch: Partial<EntryFormState>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const updatePartner = (value: string) => update({ partner: value });

  const updateTaxCategory = (value: string) =>
    update({ taxCategory: value, storedTaxCategoryId: null });

  const updateBusinessCategory = (value: string) =>
    update({ businessCategory: value, storedBusinessCategoryId: null });

  const updateRow = (index: number, patch: Partial<EntryLinePair>) => {
    setDraft((current) => ({
      ...current,
      pairs: current.pairs.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addRow = () => {
    const defaultDebit =
      props.accountOptions.find(
        (account) => account.accountType === "expense",
      ) ??
      props.accountOptions[0] ??
      null;
    const defaultCredit =
      props.accountOptions.find((account) => account.accountType === "asset") ??
      props.accountOptions[0] ??
      null;
    setDraft((current) => ({
      ...current,
      pairs: [
        ...current.pairs,
        newEntryLinePair(nextLinePairId(), defaultDebit, defaultCredit),
      ],
    }));
  };

  const removeRow = (index: number) => {
    setDraft((current) => ({
      ...current,
      pairs: current.pairs.filter((_, i) => i !== index),
    }));
  };

  const guideTriggerRef = useRef<HTMLButtonElement>(null);
  const guideWasOpenRef = useRef(false);
  const guideOpen = guideStack.length > 0;
  useEffect(() => {
    if (guideWasOpenRef.current && !guideOpen) guideTriggerRef.current?.focus();
    guideWasOpenRef.current = guideOpen;
  }, [guideOpen]);

  const openGuide = () => setGuideStack(["top"]);
  const closeGuide = () => setGuideStack([]);
  const pushGuide = (next: QuickGuidePage) =>
    setGuideStack((current) => [...current, next]);
  const popGuide = () =>
    setGuideStack((current) =>
      current.length <= 1 ? [] : current.slice(0, -1),
    );

  const findAccountByName = (name: string): EntryMasterAccountOption | null =>
    resolveGuideBookAccount(name, props.accountOptions);

  const applyGuideTemplate = (template: QuickGuideTemplate) => {
    const debit = findAccountByName(template.debitAccountName);
    const credit = findAccountByName(template.creditAccountName);
    if (debit == null || credit == null) {
      setErrorText(
        `勘定科目「${
          debit == null ? template.debitAccountName : template.creditAccountName
        }」が見つかりません`,
      );
      return;
    }
    setDraft((current) => {
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
        pairs: [newEntryLinePair(nextLinePairId(), debit, credit)],
      };
    });
    setErrorText(null);
    closeGuide();
  };

  const handleGuideSelectOption = (option: QuickGuideOption) => {
    const template = option.template;
    if (template != null) {
      if (!hasEnteredLines) {
        applyGuideTemplate(template);
        return;
      }
      void confirm({
        tone: "danger",
        title: "テンプレートの適用",
        body: ["入力した行は消えます。"],
        confirmLabel: "適用する",
      }).then((confirmed) => {
        if (confirmed) applyGuideTemplate(template);
      });
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
  const hasDescription = draft.description.trim() !== "";
  const allRowsValid = draft.pairs.every((row) => {
    const hasDebit =
      row.debitAccountName.trim() !== "" || parseAmount(row.debitAmount) > 0;
    const hasCredit =
      row.creditAccountName.trim() !== "" || parseAmount(row.creditAmount) > 0;
    if (!hasDebit && !hasCredit) return false;
    const debitValid =
      !hasDebit ||
      (row.debitAccountName.trim() !== "" && parseAmount(row.debitAmount) > 0);
    const creditValid =
      !hasCredit ||
      (row.creditAccountName.trim() !== "" &&
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
      `借方金額と貸方金額の合計を一致させてください。差額: ¥${formatAmount(
        Math.abs(debitTotal - creditTotal),
      )}`,
    );

  const handleSave = async () => {
    setTriedSave(true);
    if (validationMessages.length > 0) return;
    const release = mutationLock.current.tryAcquire();
    if (release == null) return;
    setSaving(true);
    setErrorText(null);
    try {
      await props.onSave(
        entryFormStateToEntryDraft(draft, props.accountOptions),
      );
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

  const footerMessages =
    triedSave && validationMessages.length > 0
      ? validationMessages
      : errorText != null
        ? [errorText]
        : [];

  return (
    <>
      <div
        onClick={requestDismiss}
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
        aria-label={props.mode === "create" ? "仕訳の新規作成" : "仕訳の編集"}
        tabIndex={-1}
        className="bk-entry-drawer bk-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: sizes.drawer.width,
          maxWidth: "100vw",
          background: entryDrawerColors.bg,
          boxShadow: shadows.drawer,
          borderLeft: `1px solid ${entryDrawerColors.border}`,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: DRAWER_SLIDE_IN_ANIMATION,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <style>{`
          ${DRAWER_SLIDE_IN_KEYFRAMES}
          .bk-drawer-input { box-shadow: ${shadows.inputInset}; }
          .bk-drawer-input:focus {
            border-color: ${entryDrawerColors.blue} !important;
            box-shadow: 0 0 0 1px ${entryDrawerColors.blue}, ${rings.brandFocus}, ${shadows.inputInset};
          }
          .bk-drawer-menu-item { transition: background 80ms ease; }
          .bk-drawer-menu-item:hover { background: #F1F5F9; }
        `}</style>

        <header
          style={{
            height: sizes.drawer.headerHeight,
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
            className="bk-phone-tap-target"
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
            <CloseIcon size={18} color="currentColor" />
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
                <QuickGuideTriggerButton
                  onClick={openGuide}
                  buttonRef={guideTriggerRef}
                />
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
                        <StackedField label="借方科目">
                          <AccountPicker
                            ariaLabel="借方科目"
                            popupAlign="left"
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
                          />
                        </StackedField>
                        <StackedField label="貸方科目">
                          <AccountPicker
                            ariaLabel="貸方科目"
                            popupAlign="right"
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
                          />
                        </StackedField>
                        <StackedField label="借方金額">
                          <AmountInput
                            signed={false}
                            value={row.debitAmount}
                            onChange={(value) =>
                              updateRow(index, { debitAmount: value })
                            }
                            ariaLabel={null}
                          />
                        </StackedField>
                        <StackedField label="貸方金額">
                          <AmountInput
                            signed={false}
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
                    ariaLabel="行を追加"
                    label="行を追加"
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
                      options={props.suggestions.partner}
                      ariaLabel="取引先"
                      placeholder="取引先を入力"
                      align="left"
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
                      options={BUSINESS_RATE_PRESETS}
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
                label="税区分"
                control={
                  <div style={{ width: 120 }}>
                    <SuggestionInput
                      value={draft.taxCategory}
                      onChange={updateTaxCategory}
                      options={mergeOptions(
                        props.taxCategoryOptions.map((option) => option.name),
                        props.suggestions.taxCategory,
                      )}
                      ariaLabel="税区分"
                      placeholder="未選択"
                      align="left"
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
                        props.businessCategoryOptions.map(
                          (option) => option.name,
                        ),
                        props.suggestions.businessCategory,
                      )}
                      ariaLabel="事業区分"
                      placeholder="未選択"
                      align="left"
                      inputMode={null}
                    />
                  </div>
                }
                hint={null}
                divider={false}
              />
              {storedLineValueDifferences.length > 0 ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: fontSize.sm,
                    color: palette.textLabel,
                    lineHeight: 1.5,
                  }}
                >
                  {lineValueDifferencesMessage(storedLineValueDifferences)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer
          style={{
            position: "relative",
            padding: "16px 20px",
            borderTop: `1px solid ${entryDrawerColors.border}`,
            background: entryDrawerColors.bg,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {footerMessages.length > 0 ? (
            <div
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: "calc(100% + 8px)",
              }}
            >
              <ValidationCard messages={footerMessages} />
            </div>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
                minWidth: 0,
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
              ) : null}
              <BalanceIndicator
                debitAmount={debitTotal}
                creditAmount={creditTotal}
              />
            </div>
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
                {saving ? "保存中…" : props.mode === "create" ? "作成" : "保存"}
              </button>
            </div>
          </div>
        </footer>
        {confirmDialog}
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

function mergeOptions(
  primary: Iterable<string>,
  secondary: Iterable<string>,
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const option of [...primary, ...secondary]) {
    const trimmed = option.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}
