"use client";

import { useRef, useState } from "react";
import { AppError, type FiscalPeriod } from "@rubydogjp/openkk-driver";
import { useOpenkkAppState } from "../bindings/index.js";
import { AppErrorText } from "../shared/app-error-text.js";
import { useConfirmDialog } from "../shared/confirm-dialog.js";
import { ExclusiveActionLock } from "../shared/exclusive-action-lock.js";
import {
  fontSize,
  fontWeight,
  palette,
  sizes,
  typography,
} from "../shared/design-tokens.js";
import {
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSecondaryButton,
  StepSectionLabel,
} from "../steps/step-ui.js";
import { useRouter } from "../routing/routing.js";

export const LEGACY_PURGED_PERIOD_LABEL = "データ削除済み";

export function LegacyPurgedFiscalPeriodScreen({
  fiscalPeriod,
}: {
  fiscalPeriod: FiscalPeriod;
}) {
  const appState = useOpenkkAppState();
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const removeLock = useRef(new ExclusiveActionLock());
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<AppError | null>(null);

  const handleRemove = async () => {
    const release = removeLock.current.tryAcquire();
    if (release == null) return;
    try {
      const confirmed = await confirm({
        tone: "danger",
        title: "期間の削除",
        body: [`「${fiscalPeriod.name}」を期間の一覧から消します。`],
        confirmLabel: "削除する",
      });
      if (!confirmed) return;
      setIsRemoving(true);
      await appState.discardFiscalPeriod(fiscalPeriod.id);
      router.push("/fiscal-periods");
    } catch (error) {
      setRemoveError(
        AppError.from(error, {
          fallbackUserMessage: "期間の削除に失敗しました",
          fallbackDeveloperMessage:
            "legacy/purged-fiscal-period: remove failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsRemoving(false);
      release();
    }
  };

  return (
    <section
      style={{
        padding: 24,
        minHeight: "100%",
        boxSizing: "border-box",
        background: palette.pageBg,
      }}
    >
      <div
        style={{
          maxWidth: sizes.content.controlBarMaxWidth,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <header style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: fontSize.sm,
              fontWeight: fontWeight.bold,
              color: palette.textLabel,
              marginBottom: 8,
            }}
          >
            {LEGACY_PURGED_PERIOD_LABEL}
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: typography.dialogTitle.fontSize,
              fontWeight: fontWeight.bold,
              color: palette.text,
            }}
          >
            {fiscalPeriod.name}
          </h1>
        </header>

        <StepSectionLabel>会計期間</StepSectionLabel>
        <StepMetaCard>
          <StepMetaRow
            label="期間"
            value={`${fiscalPeriod.startDate} 〜 ${fiscalPeriod.endDate}`}
            divider={false}
          />
          <StepMetaRow
            label="状態"
            value="以前に圧縮保存したあと、データを削除済み"
            divider
          />
        </StepMetaCard>

        <div
          style={{
            marginTop: 14,
            fontSize: fontSize.sm,
            color: palette.textLabel,
            lineHeight: 1.7,
          }}
        >
          この会計期間のデータは、ここには残っていません。以前の圧縮済みファイル
          (.zip)
          を、期間の選択の「ファイル」から取り込むと、新しい会計期間として見られます。
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <StepSecondaryButton onClick={() => void handleRemove()}>
            {isRemoving ? "削除中…" : "この期間を削除"}
          </StepSecondaryButton>
          <StepPrimaryButton
            describedBy={null}
            onClick={() => {
              appState.clearFiscalPeriod();
              router.push("/fiscal-periods");
            }}
            disabled={false}
            variant={null}
            icon={null}
          >
            期間の選択へ
          </StepPrimaryButton>
        </div>
        {removeError != null ? (
          <div style={{ marginTop: 16 }}>
            <AppErrorText
              error={removeError}
              style={null}
              fallbackUserMessage={null}
            />
          </div>
        ) : null}
        {dialog}
      </div>
    </section>
  );
}
