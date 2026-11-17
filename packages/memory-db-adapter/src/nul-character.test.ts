import { describe, expect, it } from "vitest";

import type { EntryDbUpsertInput } from "@rubydogjp/openkk-engine";

import { createMemoryDbAdapter } from "./index.js";

const USER_ID = "user-1";

function entryWith(description: string): EntryDbUpsertInput {
  const line = (side: "debit" | "credit", bookAccountId: string) => ({
    side,
    bookAccountId,
    amount: 1000,
    partnerName: "",
    taxCategoryId: "tax_out_of_scope",
    businessCategoryId: "biz_none",
  });
  return {
    date: "2026-04-01",
    description,
    localId: null,
    businessRate: 1,
    lines: [line("debit", "acct_cash"), line("credit", "acct_sales")],
  };
}

async function journalizingPeriod() {
  const db = await createMemoryDbAdapter(null);
  const created = await db.fiscalPeriods.create(USER_ID, {
    name: "2026年分",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  await db.fiscalPeriods.start(created.id);
  return { db, fiscalPeriodId: created.id };
}

describe("U+0000 in stored text (why the API refuses it at the entrance)", () => {
  it("cuts a stored text at U+0000 when it is read back", async () => {
    const { db, fiscalPeriodId } = await journalizingPeriod();
    await db.entries.create(USER_ID, fiscalPeriodId, entryWith("abc\u0000def"));

    const [stored] = await db.entries.getAll(fiscalPeriodId);

    expect(stored?.description).toBe("abc");
  });

  it("can no longer read a period's entries once one description starts with U+0000", async () => {
    const { db, fiscalPeriodId } = await journalizingPeriod();
    await db.entries.create(USER_ID, fiscalPeriodId, entryWith("家賃"));
    await db.entries.create(USER_ID, fiscalPeriodId, entryWith("\u0000家賃"));

    await expect(db.entries.getAll(fiscalPeriodId)).rejects.toThrow(
      /description is required/,
    );
  });
});
