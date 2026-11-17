import { describe, expect, it } from "vitest";
import {
  computeStraightLineDepreciation,
  createFixedClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  deriveSteps,
  type OpenkkConfig,
} from "@rubydogjp/openkk-driver";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import {
  demoFixedAssetItems,
  demoOpeningBalanceLines,
} from "../demo/demo-content";
import { buildOpenkkDemoSeed } from "../demo/demo-seed";

const ASSET_ACCOUNT_NAME_BY_ID: Record<string, string> = {
  acct_equipment: "a:工具器具備品",
  acct_vehicle: "a:車両運搬具",
  acct_machine: "a:機械装置",
};

const config: OpenkkConfig = {
  clock: createFixedClock(new Date(2026, 8, 5)),
  bundleLabel: "デモ版",
  authMode: "embedded",
  embeddedUser: { kind: "embedded", id: "openkk-demo-user", displayName: "" },
  initialFiscalPeriodId: null,
  sessionStorageKey: "test.session",
  fiscalPeriodStorageKey: "test.fiscal_period",
  fiscalPeriodPolicy: DEFAULT_FISCAL_PERIOD_POLICY,
  editingPolicy: DEFAULT_EDITING_POLICY,
  debugRoutesEnabled: false,
  myPagePath: null,
};

describe("demo seed", () => {
  it("loads a balanced sample period ready for journalizing", async () => {
    const db = await createMemoryDbAdapter(buildOpenkkDemoSeed(config));
    const periods = await db.fiscalPeriods.getAll(config.embeddedUser.id);
    expect(periods.map((period) => period.id)).toEqual(["fp-2026"]);
    const period = periods[0]!;
    expect(period.phase).toBe("journalizing");
    expect(period.openingBalancesCompleted).toBe(true);
    expect(
      deriveSteps({
        started: period.phase !== "pre_opening",
        openingBalancesCompleted: period.openingBalancesCompleted,
        hasAnyClosing: false,
        hasFinalClosing: false,
        hasReceivedDocuments: period.documentsReceivedCompleted,
      }).map((step) => step.status),
    ).toEqual(["done", "done", "doing", "todo", "todo", "todo"]);
    const balances = period.opening.balanceLines;
    const total = (prefix: string) =>
      balances
        .filter((line) => line.accountId.startsWith(prefix))
        .reduce((sum, line) => sum + line.amount, 0);
    expect(total("a:")).toBeGreaterThan(0);
    expect(total("a:")).toBe(total("l:"));
  });

  it("opens with the book value of the fixed assets bought before the period", () => {
    const bookValues = new Map<string, number>();
    for (const asset of demoFixedAssetItems) {
      if (asset.acquisitionDate >= "2026-01-01") continue;
      const accountId = ASSET_ACCOUNT_NAME_BY_ID[asset.bookAccountId]!;
      const { currentBookValue } = computeStraightLineDepreciation({
        acquisitionDate: asset.acquisitionDate,
        acquisitionCost: asset.acquisitionCost,
        usefulLife: asset.usefulLife,
        asOf: new Date(2025, 11, 31),
      });
      bookValues.set(
        accountId,
        (bookValues.get(accountId) ?? 0) + currentBookValue,
      );
    }
    expect(
      Object.fromEntries(
        demoOpeningBalanceLines
          .filter((line) => bookValues.has(line.accountId))
          .map((line) => [line.accountId, line.amount]),
      ),
    ).toEqual(Object.fromEntries(bookValues));
  });
});
