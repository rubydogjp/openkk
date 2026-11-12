import { describe, expect, it } from "vitest";

import type {
  FixedAssetDraft,
  OpeningCarryoverDraft,
} from "../../domain/index.js";
import {
  FAKE_TODAY,
  fakeBackend,
  fakeConfig,
  fakeFiscalPeriod,
  fakeStorage,
  settle,
  type FakeBackend,
} from "../../../test-support/fake-backend.js";
import { createOpenkkAppStore } from "../session/app-store.js";
import { createWritableState } from "../shared/observable-state.js";
import { createOpenkkAssistStore } from "./assist-store.js";

const EQUIPMENT_DRAFT: FixedAssetDraft = {
  name: "パソコン",
  account: "工具器具備品",
  acquisitionDate: "2026-02-01",
  acquisitionCost: "240,000",
  usefulLife: 4,
  businessRatePercent: 100,
  businessRate: 1,
  status: "active",
  disposalDate: null,
  disposalPrice: null,
};

const CARRYOVER_DRAFT: OpeningCarryoverDraft = {
  date: "2026-01-01",
  description: "前期の未収",
  businessRateInput: "100",
  businessRate: 1,
  lines: [
    {
      id: null,
      side: "debit",
      accountName: "現金",
      accountType: "asset",
      amount: "3,000",
      bookAccountId: "acct_cash",
      partnerName: null,
      taxCategoryId: "tax_out_of_scope",
      taxCategoryName: null,
      businessCategoryId: "biz_none",
      businessCategoryName: null,
    },
    {
      id: null,
      side: "credit",
      accountName: "売上高",
      accountType: "revenue",
      amount: "3,000",
      bookAccountId: "acct_sales",
      partnerName: null,
      taxCategoryId: "tax_out_of_scope",
      taxCategoryName: null,
      businessCategoryId: "biz_none",
      businessCategoryName: null,
    },
  ],
};

async function startedStores(
  fake: FakeBackend,
  selectedFiscalPeriodId: string,
) {
  const config = fakeConfig({});
  const app = createOpenkkAppStore({
    config,
    backend: fake.backend,
    storage: fakeStorage({ "test.fiscal_period_id": selectedFiscalPeriodId }),
  });
  const today = createWritableState(FAKE_TODAY);
  const assist = createOpenkkAssistStore({ config, app, today });
  app.start();
  assist.start();
  await settle();
  return { app, assist, today };
}

describe("createOpenkkAssistStore", () => {
  it("adds, changes and removes a fixed asset of the selected period", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { assist } = await startedStores(fake, "fp-1");

    const assetId = await assist.getState().addFixedAsset(EQUIPMENT_DRAFT);
    expect(assetId).not.toBeNull();
    const added = assist.getState().getFixedAsset(assetId!);
    expect(added?.accountName).toBe("工具器具備品");
    expect(fake.fixedAssets[0]?.acquisitionCost).toBe(240000);

    await assist.getState().updateFixedAsset(assetId!, {
      ...EQUIPMENT_DRAFT,
      name: "ノートパソコン",
    });
    expect(assist.getState().listFixedAssets("fp-1")[0]?.name).toBe(
      "ノートパソコン",
    );

    expect(await assist.getState().deleteFixedAsset(assetId!)).toBe(true);
    expect(assist.getState().listFixedAssets("fp-1")).toEqual([]);
  });

  it("does not add a fixed asset without a selected period", async () => {
    const fake = fakeBackend();
    const { assist } = await startedStores(fake, "");

    expect(await assist.getState().addFixedAsset(EQUIPMENT_DRAFT)).toBeNull();
    expect(fake.calls).not.toContain("fixedAssets.create");
  });

  it("loads fixed assets again when the day changes", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { assist, today } = await startedStores(fake, "fp-1");
    await assist.getState().addFixedAsset(EQUIPMENT_DRAFT);
    fake.calls.length = 0;

    today.setState(new Date(2026, 5, 16));
    await settle();

    expect(fake.calls).toContain("fixedAssets.getAll");
  });

  it("keeps opening carryovers in the fiscal period and lists them with names", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { app, assist } = await startedStores(fake, "fp-1");

    const carryoverId = await assist
      .getState()
      .addOpeningCarryover("fp-1", CARRYOVER_DRAFT);

    expect(carryoverId).toBe("oc-fp-1-1");
    expect(app.getState().currentFiscalPeriod?.opening.journals).toHaveLength(
      1,
    );
    const [listed] = assist.getState().listOpeningCarryovers("fp-1");
    expect(listed?.lines.map((item) => item.accountName)).toEqual([
      "現金",
      "売上高",
    ]);
    expect(
      assist.getState().getOpeningCarryover("oc-fp-1-1")?.description,
    ).toBe("前期の未収");

    await assist.getState().updateOpeningCarryover("oc-fp-1-1", {
      ...CARRYOVER_DRAFT,
      description: "前期の未収 (直し)",
    });
    expect(
      assist.getState().getOpeningCarryover("oc-fp-1-1")?.description,
    ).toBe("前期の未収 (直し)");

    expect(await assist.getState().deleteOpeningCarryover("oc-fp-1-1")).toBe(
      true,
    );
    expect(assist.getState().listOpeningCarryovers("fp-1")).toEqual([]);
    expect(await assist.getState().deleteOpeningCarryover("oc-fp-1-1")).toBe(
      false,
    );
  });

  it("shows a failed fixed asset load until the next load succeeds", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { assist } = await startedStores(fake, "fp-1");
    const failure = new Error("offline");
    const seenErrors: unknown[] = [];
    assist.subscribe(() => seenErrors.push(assist.getState().loadError));
    fake.rejectNext("fixedAssets.getAll", failure);

    assist.getState().reload();
    await settle();

    expect(seenErrors).toContain(failure);
    expect(assist.getState().loadError).toBeNull();
  });

  it("keeps a failed master load as the load error", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { assist } = await startedStores(fake, "fp-1");
    const failure = new Error("offline");
    fake.rejectNext("masterData.getBookAccounts", failure);

    assist.getState().reload();
    await settle();
    expect(assist.getState().loadError).toBe(failure);

    assist.getState().reload();
    await settle();
    expect(assist.getState().loadError).toBeNull();
  });
});
