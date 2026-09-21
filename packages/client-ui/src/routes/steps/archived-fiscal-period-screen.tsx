"use client";

import { useRef, useState } from "react";

import { useRouter } from "next/navigation.js";

import {
  AppError,
  buildFiscalPeriodArchiveFilename,
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  isArchivedStub,
  type FiscalPeriod,
} from "@rubydogjp/openkk-client-domain";
import {
  useBackendApi,
  useOpenkkAppState,
} from "@rubydogjp/openkk-client-usecases";
import { AppErrorText } from "../../shared/app-error-text.js";
import {
  fontSize,
  fontWeight,
  palette,
  sizes,
  typography,
} from "../../shared/design-tokens.js";
import { downloadBytes } from "../../shared/download.js";
import { ExclusiveActionLock } from "../../shared/exclusive-action-lock.js";
import {
  StepMetaCard,
  StepMetaRow,
  StepPrimaryButton,
  StepSectionLabel,
} from "../../steps/step-ui.js";

export function ArchivedFiscalPeriodScreen({
  fiscalPeriod,
}: {
  fiscalPeriod: FiscalPeriod;
}) {
  const backendApi = useBackendApi();
  const appState = useOpenkkAppState();
  const router = useRouter();
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadLock = useRef(new ExclusiveActionLock());
  const [screenError, setScreenError] = useState<unknown>(null);
  const archivePayloadPurged = isArchivedStub(fiscalPeriod);

  const handleDownload = async () => {
    const release = downloadLock.current.tryAcquire();
    if (release == null) return;
    const authOperationVersion = appState.captureAuthOperationVersion();
    setIsDownloading(true);
    try {
      const year = Number(fiscalPeriod.endDate.slice(0, 4));
      const [entries, fixedAssets, preClosed, closed] = await Promise.all([
        backendApi.entries.getAll(fiscalPeriod.id),
        backendApi.fixedAssets.getAll(fiscalPeriod.id),
        backendApi.preClosings.get(fiscalPeriod.id, year),
        backendApi.closings.get(fiscalPeriod.id, year),
      ]);
      appState.assertAuthOperationCurrent(authOperationVersion);
      const payload = buildFiscalPeriodArchivePayload({
        createdAt: new Date().toISOString(),
        fiscalPeriod,
        entries: entries.map((entry) => ({ ...entry })),
        fixedAssets: fixedAssets.map((asset) => ({ ...asset })),
        closings: [
          ...(!preClosed
            ? []
            : [{ fiscalPeriodId: fiscalPeriod.id, year, kind: "pre_closing" }]),
          ...(!closed
            ? []
            : [{ fiscalPeriodId: fiscalPeriod.id, year, kind: "closing" }]),
        ],
      });
      downloadBytes(
        createFiscalPeriodArchiveZip(payload),
        buildFiscalPeriodArchiveFilename(fiscalPeriod),
        "application/zip",
      );
      setScreenError(null);
    } catch (error) {
      if (!appState.isAuthOperationCurrent(authOperationVersion)) return;
      setScreenError(
        AppError.from(error, {
          fallbackUserMessage: "圧縮済みファイルの作成に失敗しました",
          fallbackDeveloperMessage: "steps/archived: download archive failed",
          statusCode: null,
        }),
      );
    } finally {
      setIsDownloading(false);
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
            divider={false}
          />
          <StepMetaRow
            label="状態"
            value={
              archivePayloadPurged
                ? "圧縮保存済み（データは削除されました）"
                : "圧縮保存済み"
            }
            divider
          />
        </StepMetaCard>

        {archivePayloadPurged ? (
          <div
            style={{
              marginTop: 14,
              fontSize: fontSize.sm,
              color: palette.textLabel,
              lineHeight: 1.7,
            }}
          >
            この会計期間のデータはサーバから削除されています。再ダウンロード・閲覧はできません。
          </div>
        ) : null}

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
            期間一覧へ
          </StepPrimaryButton>
          {archivePayloadPurged ? null : (
            <StepPrimaryButton
              onClick={handleDownload}
              disabled={isDownloading}
              variant="success"
              icon={null}
            >
              {isDownloading ? "作成中" : "圧縮済みファイルをダウンロード"}
            </StepPrimaryButton>
          )}
        </div>

        {screenError != null ? (
          <div style={{ marginTop: 16 }}>
            <AppErrorText error={screenError} style={null} fallbackUserMessage={null} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
