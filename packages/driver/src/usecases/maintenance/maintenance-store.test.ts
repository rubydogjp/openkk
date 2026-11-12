import { afterEach, describe, expect, it, vi } from "vitest";

import { MAINTENANCE_MODE_ERROR_CODE } from "../../ports/index.js";
import { fakeBackend, settle } from "../../../test-support/fake-backend.js";
import { createMaintenanceStore } from "./maintenance-store.js";

const ANNOUNCED = {
  enabled: true,
  title: "お知らせ",
  message: "作業中です",
  updatedAt: "2026-06-15T00:00:00.000Z",
};

describe("createMaintenanceStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports no maintenance while the backend is open", async () => {
    const fake = fakeBackend();
    const store = createMaintenanceStore(fake.backend);

    store.start();
    await settle();

    expect(store.getState().status).toBeNull();
  });

  it("shows the announced maintenance on start", async () => {
    const fake = fakeBackend();
    fake.maintenance.status = ANNOUNCED;
    const store = createMaintenanceStore(fake.backend);

    store.start();
    await settle();

    expect(store.getState().status).toEqual(ANNOUNCED);
  });

  it("enters maintenance when a call through its backend is refused", async () => {
    const fake = fakeBackend();
    const store = createMaintenanceStore(fake.backend);
    store.start();
    await settle();
    fake.maintenance.status = ANNOUNCED;
    fake.rejectNext("fiscalPeriods.getAll", {
      code: MAINTENANCE_MODE_ERROR_CODE,
    });

    await expect(store.backend.fiscalPeriods.getAll()).rejects.toEqual({
      code: MAINTENANCE_MODE_ERROR_CODE,
    });
    expect(store.getState().status?.enabled).toBe(true);
    await settle();

    expect(store.getState().status).toEqual(ANNOUNCED);
  });

  it("checks again on a timer and leaves maintenance when it ends", async () => {
    vi.useFakeTimers();
    const fake = fakeBackend();
    fake.maintenance.status = ANNOUNCED;
    const store = createMaintenanceStore(fake.backend);
    const stop = store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().status).toEqual(ANNOUNCED);

    fake.maintenance.status = { ...ANNOUNCED, enabled: false };
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getState().status).toBeNull();

    fake.calls.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.calls).toEqual([]);
    stop();
  });
});
