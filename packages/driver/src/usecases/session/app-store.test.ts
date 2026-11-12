import { describe, expect, it } from "vitest";

import { AppError, DEFAULT_EDITING_POLICY } from "../../domain/index.js";
import {
  fakeBackend,
  fakeConfig,
  fakeFiscalPeriod,
  fakeStorage,
  settle,
} from "../../../test-support/fake-backend.js";
import { createOpenkkAppStore } from "./app-store.js";

const STORED_CUSTOM_USER = JSON.stringify({
  kind: "custom",
  id: "custom-1",
  displayName: "保存された人",
  email: null,
  iconUrl: null,
  authProvider: "google",
});

describe("createOpenkkAppStore", () => {
  it("does nothing until it is started", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({ "test.fiscal_period_id": "fp-1" }),
    });
    await settle();

    expect(fake.calls).toEqual([]);
    expect(store.getState().isReady).toBe(false);
    expect(store.getState().currentFiscalPeriodId).toBeNull();
  });

  it("restores the selected fiscal period and loads the list on start", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({ "test.fiscal_period_id": "fp-1" }),
    });

    store.start();
    expect(store.getState().isReady).toBe(true);
    expect(store.getState().currentFiscalPeriodId).toBe("fp-1");
    await settle();

    expect(store.getState().fiscalPeriods.map((period) => period.id)).toEqual([
      "fp-1",
    ]);
    expect(store.getState().currentFiscalPeriod?.name).toBe("2026年");
  });

  it("forgets a stored fiscal period that no longer exists", async () => {
    const fake = fakeBackend();
    const storage = fakeStorage({ "test.fiscal_period_id": "fp-gone" });
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage,
    });

    store.start();
    await settle();

    expect(store.getState().currentFiscalPeriodId).toBeNull();
    expect(storage.items.has("test.fiscal_period_id")).toBe(false);
  });

  it("selects and remembers a fiscal period it creates", async () => {
    const fake = fakeBackend();
    const storage = fakeStorage({});
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage,
    });
    store.start();
    await settle();

    const createdId = await store.getState().createFiscalPeriod({
      name: "2027年",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
    });

    expect(store.getState().currentFiscalPeriodId).toBe(createdId);
    expect(store.getState().currentFiscalPeriod?.name).toBe("2027年");
    expect(storage.items.get("test.fiscal_period_id")).toBe(createdId);
  });

  it("keeps the same state object until something changes", async () => {
    const fake = fakeBackend();
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    store.start();
    await settle();
    const notifications: number[] = [];
    store.subscribe(() => notifications.push(notifications.length));

    const before = store.getState();
    expect(store.getState()).toBe(before);
    store.getState().selectFiscalPeriod("fp-9");

    expect(store.getState()).not.toBe(before);
    expect(notifications).toEqual([0]);
  });

  it("resolves a patch against the latest fiscal period", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1", name: "前の名前" }));
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    store.start();
    await settle();
    const staleState = store.getState();
    await staleState.updateFiscalPeriod("fp-1", { name: "途中の名前" });

    const updated = await staleState.updateFiscalPeriod("fp-1", (current) => ({
      name: `${current.name}の次`,
    }));

    expect(updated).toBe(true);
    expect(store.getState().fiscalPeriods[0]?.name).toBe("途中の名前の次");
  });

  it("ignores a fiscal period list that arrives after stop", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    const release = fake.holdNext("fiscalPeriods.getAll");

    const stop = store.start();
    stop();
    release();
    await settle();

    expect(store.getState().fiscalPeriods).toEqual([]);
  });

  it("loads again when started a second time", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({}),
    });

    store.start()();
    store.start();
    await settle();

    expect(store.getState().fiscalPeriods).toHaveLength(1);
  });

  it("keeps the load error and clears it on a successful reload", async () => {
    const fake = fakeBackend();
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    const failure = new Error("offline");
    fake.rejectNext("fiscalPeriods.getAll", failure);
    store.start();
    await settle();
    expect(store.getState().fiscalPeriodLoadError).toBe(failure);

    store.getState().reloadFiscalPeriods();
    await settle();

    expect(store.getState().fiscalPeriodLoadError).toBeNull();
  });

  it("refuses to change data while editing is locked", async () => {
    const fake = fakeBackend();
    const store = createOpenkkAppStore({
      config: fakeConfig({
        editingPolicy: { ...DEFAULT_EDITING_POLICY, locked: true },
      }),
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    store.start();
    await settle();

    await expect(
      store.getState().createFiscalPeriod({
        name: "2027年",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fake.calls).not.toContain("fiscalPeriods.create");
  });

  it("restores a stored custom user and remembers it", async () => {
    const fake = fakeBackend();
    const storage = fakeStorage({ "test.session": STORED_CUSTOM_USER });
    const store = createOpenkkAppStore({
      config: fakeConfig({ authMode: "custom" }),
      backend: fake.backend,
      storage,
    });
    expect(store.getState().session).toBeNull();

    store.start();
    await settle();

    expect(store.getState().session?.user.id).toBe("custom-1");
    expect(storage.items.has("test.session")).toBe(true);
    expect(fake.calls).toContain("fiscalPeriods.getAll");
  });

  it("returns to signed out when the backend answers 401", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(
      fakeFiscalPeriod({ id: "fp-1", userId: "custom-1" }),
    );
    const storage = fakeStorage({ "test.session": STORED_CUSTOM_USER });
    const store = createOpenkkAppStore({
      config: fakeConfig({ authMode: "custom" }),
      backend: fake.backend,
      storage,
    });
    store.start();
    await settle();
    fake.rejectNext("entries.getAll", { statusCode: 401 });

    await expect(store.backend.entries.getAll("fp-1")).rejects.toEqual({
      statusCode: 401,
    });

    expect(store.getState().session).toBeNull();
    expect(store.getState().fiscalPeriods).toEqual([]);
    expect(storage.items.has("test.session")).toBe(false);
  });

  it("signs in through the completion code and loads that user's periods", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(
      fakeFiscalPeriod({ id: "fp-1", userId: "custom-1" }),
    );
    const storage = fakeStorage({});
    const store = createOpenkkAppStore({
      config: fakeConfig({ authMode: "custom" }),
      backend: fake.backend,
      storage,
    });
    store.start();
    await settle();
    expect(fake.calls).not.toContain("fiscalPeriods.getAll");

    const user = await store.getState().completeSignIn("state", "code");
    await settle();

    expect(user.id).toBe("custom-1");
    expect(store.getState().session?.user.displayName).toBe("サインインした人");
    expect(store.getState().fiscalPeriods).toHaveLength(1);
    expect(JSON.parse(storage.items.get("test.session") ?? "null").id).toBe(
      "custom-1",
    );
  });

  it("only syncs a fiscal period that belongs to the signed-in user", async () => {
    const fake = fakeBackend();
    const store = createOpenkkAppStore({
      config: fakeConfig({}),
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    store.start();
    await settle();

    store
      .getState()
      .syncFiscalPeriod(
        fakeFiscalPeriod({ id: "fp-other", userId: "someone-else" }),
      );
    store.getState().syncFiscalPeriod(fakeFiscalPeriod({ id: "fp-mine" }));

    expect(store.getState().fiscalPeriods.map((period) => period.id)).toEqual([
      "fp-mine",
    ]);
  });
});
