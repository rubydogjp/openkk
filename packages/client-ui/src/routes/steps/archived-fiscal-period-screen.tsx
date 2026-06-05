"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import {
  AppError,
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";
import {
  useBackendApi,
  useOpenkkAppState,
} from "@rubydogjp/openkk-client-usecases";
import { AppErrorText } from "../../shared/app-error-text";
import {
  fontSize,
  fontWeight,
  palette,
  sizes,
  typography,
} from "../../shared/design-tokens";
import { downloadBytes } from "../../shared/download";
import {
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSectionLabel,
} from "../../steps/step-ui";

export function ArchivedFiscalPeriodScreen({
  fiscalPeriod,
}: {
  fiscalPeriod: FiscalPeriod;
}) {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  const router = useRouter();
  const [isDownloading, setIsDownloading] = useState(false);
  const [screenError, setScreenError] = useState<unknown>(null);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const year = Number(fiscalPeriod.endDate.slice(0, 4));
      const [entries, fixedAssets, closing] = await Promise.all([
        backendApi.entries.getAll(fiscalPeriod.id),
        backendApi.fixedAssets.getAll(fiscalPeriod.id),
        backendApi.closing.get(fiscalPeriod.id, year),
      ]);
      const payload = buildFiscalPeriodArchivePayload({
        createdAt: new Date().toISOString(),
        fiscalPeriod,
        entries: entries.map((entry) => ({ ...entry })),
        fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
        closings:
          closing == null
            ? []
            : [
                {
                  fiscalPeriodId: fiscalPeriod.id,
                  year,
                  isProvisional: closing.isProvisional,
                },
              ],
      });
      downloadBytes(
        createFiscalPeriodArchiveZip(payload),
        buildFiscalPeriodArchiveFilename(fiscalPeriod),
        "application/zip",
      );
      setScreenError(null);
    } catch (error) {
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "圧縮済みファイルの作成に失敗しました",
          fallbackDeveloperMessage:
            "steps/archived: download archive failed",
        }),
      );
    } finally {
      setIsDownloading(false);
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
              color: palette.success,
              marginBottom: 8,
            }}
          >
            圧縮保存済み
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
          />
          <StepMetaRow label="状態" value="圧縮保存済み" divider />
        </StepMetaCard>

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
          >
            期間一覧へ
          </StepPrimaryButton>
          <StepPrimaryButton
            onClick={handleDownload}
            disabled={isDownloading}
            variant="success"
          >
            {isDownloading ? "作成中" : "圧縮済みファイルをダウンロード"}
          </StepPrimaryButton>
        </div>

        {screenError != null ? (
          <div style={{ marginTop: 16 }}>
            <AppErrorText error={screenError} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
