"use client";

import { useEffect, useId, useRef, useState } from "react";

import { AmountInput } from "../shared/amount-field.js";
import { useConfirmDialog } from "../shared/confirm-dialog.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import { useModalLifecycle } from "../shared/dismissible-layer.js";
import { DrawerFrame } from "../shared/drawer-frame.js";
import { debugAppError } from "../shared/app-error-text.js";
import { safeUserErrorMessage } from "../shared/safe-error-message.js";
import { fontSize, fontWeight, palette } from "../shared/design-tokens.js";
import {
  FormMessageSlot,
  FormPrimaryButton,
  FormStyles,
} from "../shared/form-fields.js";
import {
  QUICK_GUIDE_CHOICE_STYLES,
  QuickGuideChoice,
  QuickGuideHeader,
} from "../entries/quick-guide-panel.js";
import { DateInput, Field, laterIsoDate } from "./fixed-asset-edit-drawer.js";
import {
  EMPTY_FIXED_ASSET_DISPOSAL_ANSWERS,
  FIXED_ASSET_DISPOSAL_PROCEEDS_LABELS,
  fixedAssetDisposalDraft,
  fixedAssetDisposalPreviewEntries,
  fixedAssetDisposalSteps,
  fixedAssetDisposalStepTitle,
  validateFixedAssetDisposalWhen,
  type FixedAsset,
  type FixedAssetDisposalAnswers,
  type FixedAssetDisposalProceedsTo,
  type FixedAssetDraft,
} from "@rubydogjp/openkk-driver";

const DISPOSAL_PROCEEDS_DESTINATIONS: FixedAssetDisposalProceedsTo[] = [
  "bank",
  "cash",
  "owner",
];

export function FixedAssetDisposalDrawer({
  asset,
  periodStartDate,
  periodEndDate,
  onClose,
  onRecord,
}: {
  asset: FixedAsset;
  periodStartDate: string;
  periodEndDate: string;
  onClose: () => void;
  onRecord: (draft: FixedAssetDraft) => Promise<boolean>;
}) {
  const [answers, setAnswers] = useState<FixedAssetDisposalAnswers>(
    EMPTY_FIXED_ASSET_DISPOSAL_ANSWERS,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recordLock = useRef(new ExclusiveActionLock());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const messageId = useId();
  const { confirm, dialog } = useConfirmDialog();
  const steps = fixedAssetDisposalSteps(answers.kind);
  const step = steps[stepIndex] ?? "kind";
  const title = fixedAssetDisposalStepTitle(step, answers.kind);

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const requestDismiss = () => {
    if (recordLock.current.isLocked) return;
    if (answers.kind == null) {
      onClose();
      return;
    }
    void confirm({
      tone: "danger",
      title: "入力の破棄",
      body: ["入力した内容は保存されません。"],
      confirmLabel: "破棄する",
    }).then((confirmed) => {
      if (confirmed && !recordLock.current.isLocked) onClose();
    });
  };
  const drawerRef = useModalLifecycle<HTMLElement>(requestDismiss, null);

  const goTo = (index: number) => {
    setMessage(null);
    setStepIndex(index);
  };
  const goNext = (next: FixedAssetDisposalAnswers) => {
    setAnswers(next);
    setMessage(null);
    setStepIndex((index) => index + 1);
  };

  const handleWhenNext = () => {
    const problem = validateFixedAssetDisposalWhen({
      asset,
      answers,
      periodStartDate,
      periodEndDate,
    });
    if (problem != null) {
      setMessage(problem);
      return;
    }
    goNext(answers);
  };

  const handleRecord = async () => {
    const release = recordLock.current.tryAcquire();
    if (release == null) return;
    setRecording(true);
    setMessage(null);
    try {
      const ok = await onRecord(fixedAssetDisposalDraft(asset, answers));
      if (ok) onClose();
      else setMessage("記録できませんでした");
    } catch (error) {
      debugAppError(error);
      setMessage(safeUserErrorMessage(error, "記録できませんでした"));
    } finally {
      setRecording(false);
      release();
    }
  };

  return (
    <>
      <FormStyles />
      <DrawerFrame
        label={`${asset.name}の売却・廃棄`}
        drawerRef={drawerRef}
        onBackdropClick={requestDismiss}
      >
        <style>{QUICK_GUIDE_CHOICE_STYLES}</style>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px 20px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: fontSize.sm,
              fontWeight: fontWeight.semibold,
              color: palette.textLabel,
            }}
          >
            売却・廃棄　{asset.name}
          </div>
          <QuickGuideHeader
            title={title}
            titleRef={titleRef}
            canGoBack={stepIndex > 0 && !recording}
            onBack={() => goTo(stepIndex - 1)}
            onClose={requestDismiss}
          />

          {step === "kind" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <QuickGuideChoice
                title="売った"
                subtitle={null}
                onClick={() =>
                  goNext({
                    ...answers,
                    kind: "sold",
                  })
                }
              />
              <QuickGuideChoice
                title="捨てた"
                subtitle={null}
                onClick={() =>
                  goNext({
                    ...answers,
                    kind: "disposed",
                    disposalPrice: "",
                    disposalProceedsTo: null,
                  })
                }
              />
            </div>
          ) : null}

          {step === "when" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field
                label={answers.kind === "disposed" ? "捨てた日" : "売った日"}
              >
                <DateInput
                  value={answers.disposalDate}
                  min={laterIsoDate(asset.acquisitionDate, periodStartDate)}
                  max={periodEndDate}
                  onChange={(value) =>
                    setAnswers({ ...answers, disposalDate: value })
                  }
                />
              </Field>
              {answers.kind === "sold" ? (
                <Field label="売った金額 (円)">
                  <AmountInput
                    signed={false}
                    value={answers.disposalPrice}
                    onChange={(value) =>
                      setAnswers({ ...answers, disposalPrice: value })
                    }
                    ariaLabel={null}
                  />
                </Field>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <FormPrimaryButton
                  describedBy={message == null ? null : messageId}
                  onClick={handleWhenNext}
                  disabled={false}
                >
                  次へ
                </FormPrimaryButton>
              </div>
            </div>
          ) : null}

          {step === "where" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DISPOSAL_PROCEEDS_DESTINATIONS.map((destination) => (
                <QuickGuideChoice
                  key={destination}
                  title={FIXED_ASSET_DISPOSAL_PROCEEDS_LABELS[destination]}
                  subtitle={null}
                  onClick={() =>
                    goNext({ ...answers, disposalProceedsTo: destination })
                  }
                />
              ))}
            </div>
          ) : null}

          {step === "confirm" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DisposalEntryPreview
                asset={asset}
                answers={answers}
                periodStartDate={periodStartDate}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <FormPrimaryButton
                  describedBy={message == null ? null : messageId}
                  onClick={handleRecord}
                  disabled={recording}
                >
                  {recording ? "記録中…" : "記録する"}
                </FormPrimaryButton>
              </div>
            </div>
          ) : null}

          {step === "when" || step === "confirm" ? (
            <FormMessageSlot tone="error" id={messageId}>
              {message}
            </FormMessageSlot>
          ) : null}
        </div>
      </DrawerFrame>
      {dialog}
    </>
  );
}

function DisposalEntryPreview({
  asset,
  answers,
  periodStartDate,
}: {
  asset: FixedAsset;
  answers: FixedAssetDisposalAnswers;
  periodStartDate: string;
}) {
  const entries = fixedAssetDisposalPreviewEntries({
    asset,
    answers,
    periodStartDate,
  });
  const lines = entries.flatMap((entry) => entry.lines);
  if (lines.length === 0) {
    return (
      <p
        style={{ margin: 0, fontSize: fontSize.base, color: palette.textSoft }}
      >
        帳簿価額が 0 円なので、仕訳は入りません。
      </p>
    );
  }
  return (
    <table
      aria-label="本締めで入る仕訳"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: fontSize.base,
        color: palette.text,
      }}
    >
      <thead>
        <tr>
          {["", "科目", "金額"].map((label, index) => (
            <th
              key={index}
              scope="col"
              style={{
                textAlign: index === 2 ? "right" : "left",
                padding: "6px 8px",
                fontSize: fontSize.sm,
                color: palette.textLabel,
                borderBottom: `1px solid ${palette.borderStrong}`,
              }}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={index}>
            <td
              style={{
                padding: "8px",
                color: palette.textLabel,
                borderBottom: `1px solid ${palette.borderSubtle}`,
                whiteSpace: "nowrap",
              }}
            >
              {line.side === "debit" ? "借方" : "貸方"}
            </td>
            <td
              style={{
                padding: "8px",
                borderBottom: `1px solid ${palette.borderSubtle}`,
              }}
            >
              {line.accountName}
            </td>
            <td
              style={{
                padding: "8px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                borderBottom: `1px solid ${palette.borderSubtle}`,
                whiteSpace: "nowrap",
              }}
            >
              {line.amount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
