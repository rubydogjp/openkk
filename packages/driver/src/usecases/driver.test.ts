import { describe, expect, it } from "vitest";

import type { PlatformPort, PrintPort } from "../ports/index.js";
import {
  fakeBackend,
  fakeConfig,
  fakeFiscalPeriod,
  fakeStorage,
  settle,
} from "../../test-support/fake-backend.js";
import { createOpenkkDriver } from "./driver.js";

function fakePlatform(stored: Record<string, string>): PlatformPort {
  return {
    appInstall: {
      getState: () => "unavailable",
      subscribe: () => () => {},
      request: async () => "unsupported",
    },
    offlineCache: { register: () => {} },
    storage: fakeStorage(stored),
    files: { save: () => {} },
    navigation: {
      appUrl: (path) => path,
      openExternal: () => {},
      leaveTo: () => {},
      reloadAt: () => {},
    },
  };
}

const NO_PRINT: PrintPort = { openPrint: () => {} };

describe("createOpenkkDriver", () => {
  it("is quiet until started, then brings every shared state up", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const driver = createOpenkkDriver(fakeConfig({}), {
      backend: fake.backend,
      platform: fakePlatform({ "test.fiscal_period_id": "fp-1" }),
      print: NO_PRINT,
      bookFiles: null,
    });
    await settle();
    expect(fake.calls).toEqual([]);

    const stop = driver.start();
    await settle();

    expect(driver.app.getState().currentFiscalPeriod?.id).toBe("fp-1");
    expect(driver.entries.getState().accountOptions).toHaveLength(3);
    expect(driver.maintenance.getState().status).toBeNull();
    expect(fake.calls).toContain("fixedAssets.getAll");
    stop();
  });

  it("runs closing through the shared fiscal period list", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const driver = createOpenkkDriver(fakeConfig({}), {
      backend: fake.backend,
      platform: fakePlatform({ "test.fiscal_period_id": "fp-1" }),
      print: NO_PRINT,
      bookFiles: null,
    });
    driver.start();
    await settle();

    await driver.closing.runPreClosing("fp-1");
    expect(driver.app.getState().currentFiscalPeriod?.phase).toBe(
      "pre_closing",
    );

    await driver.closing.cancelPreClosing("fp-1");
    expect(driver.app.getState().currentFiscalPeriod?.phase).toBe(
      "journalizing",
    );
  });

  it("exports a fiscal period as an archive", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(
      fakeFiscalPeriod({ id: "fp-1", phase: "post_closing" }),
    );
    const driver = createOpenkkDriver(fakeConfig({}), {
      backend: fake.backend,
      platform: fakePlatform({ "test.fiscal_period_id": "fp-1" }),
      print: NO_PRINT,
      bookFiles: null,
    });
    driver.start();
    await settle();

    const zip = await driver.exportFiscalPeriodArchive(
      driver.app.getState().currentFiscalPeriod!,
    );

    expect(zip.byteLength).toBeGreaterThan(0);
  });
});
