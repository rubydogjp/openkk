import { describe, expect, it } from "vitest";
import {
  createFixedClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
  deriveSteps,
  type OpenkkConfig,
} from "@rubydogjp/openkk-client";
import { createMemoryDbAdapter } from "@rubydogjp/openkk-memory-db-adapter";

import { buildOpenkkDemoSeed } from "../demo/demo-seed";

const config: OpenkkConfig = {
  clock: createFixedClock(new Date(2026, 8, 5)),
  env: "prod",
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
});
