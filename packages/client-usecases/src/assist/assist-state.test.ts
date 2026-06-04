import { describe, expect, it } from "vitest";

import { fixedAssetDraftToPatch } from "./assist-state";
import type { FixedAssetDraft } from "@rubydogjp/openkk-client-domain";

describe("fixedAssetDraftToPatch", () => {
  it("keeps disposal date and price when an asset is sold", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "売却済",
          disposalDate: "2026-09-20",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "sold",
      disposalDate: "2026-09-20",
      disposalPrice: 50_000,
      bookAccountId: "acct_equipment",
    });
  });

  it("keeps disposal date and clears price when an asset is disposed", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "廃棄済",
          disposalDate: "2026-10-01",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "disposed",
      disposalDate: "2026-10-01",
      disposalPrice: 0,
    });
  });

  it("clears disposal fields when an asset is active again", () => {
    expect(
      fixedAssetDraftToPatch(
        draft({
          status: "償却中",
          disposalDate: "2026-09-20",
          disposalPrice: "50,000",
        }),
        "acct_equipment",
      ),
    ).toMatchObject({
      status: "active",
      disposalDate: "",
      disposalPrice: 0,
    });
  });
});

function draft(overrides: Partial<FixedAssetDraft> = {}): FixedAssetDraft {
  return {
    name: "業務用PC",
    account: "工具器具備品",
    acquisitionDate: "2026-04-01",
    acquisitionCost: "300,000",
    usefulLife: 4,
    businessRatePercent: 80,
    status: "償却中",
    ...overrides,
  };
}
