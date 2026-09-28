import {
  fontWeight,
  palette,
  type BrandConfig,
  type OpenkkCalloutSlots,
} from "@rubydogjp/openkk-client";

export const demoBrandConfig: BrandConfig = {
  marketingSiteUrl: "https://rubydog.jp/openkk",
  productSiteUrl: "https://rubydog.jp/openkk",
  accountIconUrl: "/images/demo-mode.svg",
};

export const demoCalloutSlots: OpenkkCalloutSlots = {
  stepJournalizingPreClosingHint:
    "サンプルデータで、仮締めから書類の作成まで試せます。",
  stepNextFiscalPeriodFooter: (
    <>
      <div>デモ版を使っていただきありがとうございました!</div>
      <div>
        お知らせは
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
        に掲載しています
      </div>
      <div>レビュー・要望・バグ報告も同じアカウントまでお願いしますm(_ _)m</div>
    </>
  ),
};
