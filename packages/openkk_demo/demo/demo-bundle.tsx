import {
  fontWeight,
  palette,
  type BrandConfig,
  type FiscalPeriodPolicy,
  type FiscalPeriodSeedProvider,
  type OpenkkCalloutSlots,
  type OpenkkEditingPolicy,
  bootstrapOpeningBalanceLines,
} from "@rubydogjp/openkk-client";

import { buildDemoSeedEntriesForFiscalPeriod } from "./demo-content";

export const demoEditingPolicy: OpenkkEditingPolicy = {
  locked: true,
  lockedNotice: "デモ版ではこの操作はできません",
};

export const demoFiscalPeriodPolicy: FiscalPeriodPolicy = {
  maxActivePeriods: 1,
  archiveRetention: "persistent",
};

export const demoBrandConfig: BrandConfig = {
  marketingSiteUrl: "https://rubydog.jp/openkk",
  productSiteUrl: "https://rubydog.jp/openkk",
  accountIconUrl: "/images/demo-mode.svg",
};

export const demoCalloutSlots: OpenkkCalloutSlots = {
  stepJournalizingPreClosingHint:
    "※ デモ版では、いきなり仮締めを実行して構いません。",
  stepNextFiscalPeriodFooter: (
    <>
      <div>デモ版を使っていただきありがとうございました!</div>
      <div>
        正式リリースは
        <a
          href="https://x.com/rubydogjp"
          target="_blank"
          rel="noreferrer"
          style={{
            color: palette.brand,
            fontWeight: fontWeight.bold,
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}
        >
          X公式アカウント
        </a>
        でアナウンス予定です
      </div>
      <div>レビュー・要望・バグ報告も同じアカウントまでお願いしますm(_ _)m</div>
    </>
  ),
};

// 最初の会計期間に開始残高とサンプル仕訳を投入する。
export const demoSeedFiscalPeriod: FiscalPeriodSeedProvider = ({
  fiscalPeriod,
  isFirst,
}) =>
  isFirst
    ? {
        openingBalanceLines: bootstrapOpeningBalanceLines,
        entries: buildDemoSeedEntriesForFiscalPeriod(fiscalPeriod.id),
      }
    : null;
