"use client";

import type { FiscalPeriod } from "@rubydogjp/openkk-driver";
import { useOpenkkAppState } from "../bindings/index.js";
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
          この会計期間のデータは、ここには残っていません。圧縮保存したときのファイルを、期間のリストの「ファイル」から取り込むと、新しい会計期間として見られます。
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
          }}
        >
          <StepPrimaryButton
            onClick={() => {
              appState.clearFiscalPeriod();
              router.push("/fiscal-periods");
            }}
            disabled={false}
            variant={null}
            icon={null}
          >
            期間のリストへ
          </StepPrimaryButton>
        </div>
      </div>
    </section>
  );
}
