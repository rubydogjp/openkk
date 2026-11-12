import { describe, expect, it } from "vitest";

import type { EntryLine } from "../../domain/index.js";
import {
  fakeBackend,
  fakeConfig,
  fakeFiscalPeriod,
  fakeStorage,
  settle,
  type FakeBackend,
} from "../../../test-support/fake-backend.js";
import { createOpenkkAppStore } from "../session/app-store.js";
import { createOpenkkEntriesStore, type EntryDraft } from "./entries-store.js";

function line(
  side: EntryLine["side"],
  accountName: string,
  bookAccountId: string,
): EntryLine {
  return {
    id: null,
    side,
    accountName,
    accountType: side === "debit" ? "asset" : "revenue",
    amount: "1,200",
    bookAccountId,
    partnerName: "取引先",
    taxCategoryId: "tax_out_of_scope",
    taxCategoryName: null,
    businessCategoryId: "biz_none",
    businessCategoryName: null,
  };
}

const SALES_DRAFT: EntryDraft = {
  date: "2026-03-01",
  description: "売上",
  businessRateInput: "100",
  businessRate: 1,
  lines: [
    line("debit", "現金", "acct_cash"),
    line("credit", "売上高", "acct_sales"),
  ],
};

function storedEntry(fake: FakeBackend, fiscalPeriodId: string, date: string) {
  const id = `stored-${fake.entries.length + 1}`;
  fake.entries.push({
    id,
    userId: "user-1",
    fiscalPeriodId,
    date,
    description: "保存済み",
    localId: null,
    businessRate: 1,
    lines: [
      {
        id: `${id}-d`,
        side: "debit",
        bookAccountId: "acct_cash",
        amount: 500,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
      {
        id: `${id}-c`,
        side: "credit",
        bookAccountId: "acct_sales",
        amount: 500,
        partnerName: "",
        taxCategoryId: "tax_out_of_scope",
        businessCategoryId: "biz_none",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return id;
}

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
  const entries = createOpenkkEntriesStore({ config, app });
  app.start();
  entries.start();
  await settle();
  return { app, entries };
}

describe("createOpenkkEntriesStore", () => {
  it("loads the selected period's entries with account names from the master", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    storedEntry(fake, "fp-1", "2026-02-10");
    storedEntry(fake, "fp-1", "2026-01-05");

    const { entries } = await startedStores(fake, "fp-1");

    const listed = entries.getState().listFiscalPeriodEntries("fp-1");
    expect(listed.map((record) => record.date)).toEqual([
      "2026-01-05",
      "2026-02-10",
    ]);
    expect(listed[0]?.lines.map((item) => item.accountName)).toEqual([
      "現金",
      "売上高",
    ]);
    expect(
      entries.getState().accountOptions.map((option) => option.id),
    ).toEqual(["acct_cash", "acct_equipment", "acct_sales"]);
    expect(entries.getState().loadError).toBeNull();
  });

  it("adds, changes and removes an entry in the shared list", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { entries } = await startedStores(fake, "fp-1");

    const createdId = await entries
      .getState()
      .createEntryFromDraft("fp-1", SALES_DRAFT);
    expect(entries.getState().getEntry(createdId)?.description).toBe("売上");
    expect(fake.entries[0]?.lines[0]?.amount).toBe(1200);

    await entries
      .getState()
      .saveEntry(createdId, { ...SALES_DRAFT, description: "売上 (直し)" });
    expect(entries.getState().getEntry(createdId)?.description).toBe(
      "売上 (直し)",
    );

    expect(await entries.getState().deleteEntry(createdId)).toBe(true);
    expect(entries.getState().getEntry(createdId)).toBeNull();
    expect(fake.entries).toEqual([]);
  });

  it("answers false for an entry it does not hold", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { entries } = await startedStores(fake, "fp-1");

    expect(await entries.getState().saveEntry("missing", SALES_DRAFT)).toBe(
      false,
    );
    expect(await entries.getState().deleteEntry("missing")).toBe(false);
  });

  it("follows the selected fiscal period", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(
      fakeFiscalPeriod({ id: "fp-1" }),
      fakeFiscalPeriod({
        id: "fp-2",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      }),
    );
    storedEntry(fake, "fp-2", "2027-04-01");
    const { app, entries } = await startedStores(fake, "fp-1");
    expect(entries.getState().listFiscalPeriodEntries("fp-2")).toEqual([]);

    app.getState().selectFiscalPeriod("fp-2");
    await settle();

    expect(
      entries
        .getState()
        .listFiscalPeriodEntries("fp-2")
        .map((record) => record.date),
    ).toEqual(["2027-04-01"]);
  });

  it("holds no entries for a period whose data was purged", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    storedEntry(fake, "fp-1", "2026-02-10");
    const { app, entries } = await startedStores(fake, "fp-1");
    expect(entries.getState().listFiscalPeriodEntries("fp-1")).toHaveLength(1);

    app
      .getState()
      .syncFiscalPeriod(
        fakeFiscalPeriod({ id: "fp-1", archiveStatus: "purged" }),
      );
    await settle();

    expect(entries.getState().listFiscalPeriodEntries("fp-1")).toEqual([]);
    expect(await entries.getState().reloadAndWait()).toEqual([]);
  });

  it("shows a failed load until the next load succeeds", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { entries } = await startedStores(fake, "fp-1");
    const failure = new Error("offline");
    const seenErrors: unknown[] = [];
    entries.subscribe(() => seenErrors.push(entries.getState().loadError));
    fake.rejectNext("entries.getAll", failure);

    entries.getState().reload();
    await settle();

    expect(seenErrors).toContain(failure);
    expect(entries.getState().loadError).toBeNull();
  });

  it("keeps a failed wait-for-reload as the load error", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { entries } = await startedStores(fake, "fp-1");
    const failure = new Error("offline");
    fake.rejectNext("entries.getAll", failure);

    await expect(entries.getState().reloadAndWait()).rejects.toBe(failure);
    expect(entries.getState().loadError).toBe(failure);

    await entries.getState().reloadAndWait();
    expect(entries.getState().loadError).toBeNull();
  });

  it("drops a slow load that a newer change made stale", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const { entries } = await startedStores(fake, "fp-1");
    const release = fake.holdNext("entries.getAll");
    entries.getState().reload();
    await settle();

    const createdId = await entries
      .getState()
      .createEntryFromDraft("fp-1", SALES_DRAFT);
    fake.entries.length = 0;
    release();
    await settle();

    expect(entries.getState().getEntry(createdId)).not.toBeNull();
  });

  it("imports entries and reports how many were skipped", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    storedEntry(fake, "fp-1", "2026-02-10");
    const { entries } = await startedStores(fake, "fp-1");
    const [existing] = entries.getState().listFiscalPeriodEntries("fp-1");

    const result = await entries
      .getState()
      .mergeFiscalPeriodEntries("fp-1", [existing!]);

    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(entries.getState().listFiscalPeriodEntries("fp-1")).toHaveLength(2);
  });

  it("stops following the app after stop", async () => {
    const fake = fakeBackend();
    fake.fiscalPeriods.push(fakeFiscalPeriod({ id: "fp-1" }));
    const config = fakeConfig({});
    const app = createOpenkkAppStore({
      config,
      backend: fake.backend,
      storage: fakeStorage({}),
    });
    const entries = createOpenkkEntriesStore({ config, app });
    app.start();
    entries.start()();
    await settle();
    fake.calls.length = 0;

    app.getState().selectFiscalPeriod("fp-1");
    await settle();

    expect(fake.calls).not.toContain("entries.getAll");
  });
});
