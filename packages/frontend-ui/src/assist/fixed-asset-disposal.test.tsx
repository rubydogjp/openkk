import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixedAssetToDraft, type FixedAsset } from "@rubydogjp/openkk-driver";

import { FixedAssetDisposalDrawer } from "./fixed-asset-disposal-drawer.js";
import { FixedAssetEditDrawer } from "./fixed-asset-edit-drawer.js";
import { FixedAssetsTable } from "./fixed-assets-screen.js";

const CAMERA: FixedAsset = {
  id: "fa-camera",
  fiscalPeriodId: "fp-2026",
  name: "カメラ",
  accountName: "機械装置",
  bookAccountId: "acct_machine",
  status: "active",
  acquisitionDate: "2025-01-01",
  acquisitionCost: 300_000,
  usefulLife: 5,
  businessRate: 1,
  disposalDate: null,
  disposalPrice: null,
  disposalProceedsTo: null,
  depreciationStartLabel: "",
  remainingDepreciationLabel: "",
  depreciationProgress: 0.2,
  currentBookValue: 240_000,
};
const SOLD: FixedAsset = {
  ...CAMERA,
  id: "fa-sold",
  name: "売ったPC",
  status: "sold",
  disposalDate: "2026-06-30",
  disposalPrice: 120_000,
  disposalProceedsTo: "cash",
};

function text(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

describe("fixed asset sale and disposal on screen", () => {
  it("offers the sale or disposal only on assets still in use, and only when they can be changed", () => {
    const render = (onDispose: ((id: string) => void) | null) =>
      renderToStaticMarkup(
        <FixedAssetsTable
          items={[CAMERA, SOLD]}
          readOnly={false}
          onOpenItem={() => {}}
          onDisposeItem={onDispose}
        />,
      );
    const editable = render(() => {});
    expect(editable).toContain('aria-label="カメラの売却・廃棄"');
    expect(editable).not.toContain('aria-label="売ったPCの売却・廃棄"');
    expect(render(null)).not.toContain("の売却・廃棄");
  });

  it("starts the guide by asking what happened to the asset", () => {
    const html = renderToStaticMarkup(
      <FixedAssetDisposalDrawer
        asset={CAMERA}
        periodStartDate="2026-01-01"
        periodEndDate="2026-12-31"
        onClose={() => {}}
        onRecord={async () => true}
      />,
    );
    expect(html).toContain('aria-label="カメラの売却・廃棄"');
    expect(text(html)).toContain("どうしましたか？");
    expect(text(html)).toContain("売った");
    expect(text(html)).toContain("捨てた");
    expect(html).not.toContain('aria-label="戻る"');
  });

  it("shows a recorded sale read-only with a way to take it back, and no sale or disposal in the state list", () => {
    const render = (asset: FixedAsset) =>
      renderToStaticMarkup(
        <FixedAssetEditDrawer
          mode="edit"
          initialDraft={fixedAssetToDraft(asset)}
          periodStartDate="2026-01-01"
          periodEndDate="2026-12-31"
          previewAsOf={new Date(2026, 5, 30)}
          accountOptions={["機械装置"]}
          onClose={() => {}}
          onSave={async () => true}
          onDelete={null}
        />,
      );
    const sold = text(render(SOLD));
    expect(sold).toContain("売却済み");
    expect(sold).toContain("2026-06-30");
    expect(sold).toContain("120,000 円");
    expect(sold).toContain("現金");
    expect(sold).toContain("売却・廃棄の取り消し");
    const inUse = render(CAMERA);
    expect(inUse).not.toContain("売却・廃棄の取り消し");
    expect(inUse).toContain(">償却中<");
    expect(inUse).not.toContain(">売却済み<");
    expect(inUse).not.toContain(">廃棄済み<");
  });
});
