import { describe, expect, it } from "vitest";
import {
  createFixedClock,
  DEFAULT_EDITING_POLICY,
  DEFAULT_FISCAL_PERIOD_POLICY,
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
};

describe("demo seed", () => {
  it("loads into the memory database without violating the rules", async () => {
    const db = await createMemoryDbAdapter(buildOpenkkDemoSeed(config));
    const periods = await db.fiscalPeriods.getAll(config.embeddedUser.id);
    expect(periods.map((period) => period.id)).toEqual(["fp-2026"]);
  });
});
