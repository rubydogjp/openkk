import { describe, expect, it } from "vitest";
import { buildClosingVirtualEntries } from "../packages/driver/src/domain/index.js";
import { mapOpeningJournalToRecord } from "../packages/driver/src/domain/assist/stored-record-mapping.js";
import { entryRecordToImportPayload } from "../packages/driver/src/domain/entries/entry-input-mapping.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { createOpenkkBackendApi } from "../packages/backend-api/src/index.js";
import { createEngineUsecases } from "../packages/engine/src/usecases/usecases.js";
import type { OpeningJournalApiRecord } from "../packages/backend-api/src/contract.js";

describe("driver/engine closing contract", () => {
  it("rejects missing generated entries when calling the closing usecase directly", async () => {
    const db = await createMemoryDbAdapter(null);
    const backendApi = createOpenkkBackendApi(db, { userId: "user-1" });
    const period = await backendApi.fiscalPeriods.create({
      name: "2026年分",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await backendApi.fiscalPeriods.start(period.id);
    await backendApi.fiscalPeriods.patch(period.id, {
      openingBalancesCompleted: true,
    });
    await backendApi.fixedAssets.create(period.id, {
      name: "PC",
      acquisitionDate: "2026-01-01",
      acquisitionCost: 120_000,
      usefulLife: 4,
      depreciationMethod: "straight_line",
      businessRate: 1,
      bookAccountId: "acct_equipment",
    });
    await backendApi.preClosings.run(period.id);

    await expect(
      createEngineUsecases(db).closings.run("user-1", period.id, []),
    ).rejects.toThrow(/do not match the current fiscal-period source data/);
    expect((await db.fiscalPeriods.getById(period.id))?.phase).toBe(
      "pre_closing",
    );
    expect(await db.entries.getAll(period.id)).toEqual([]);
  });

  it.each(["", "tax_10", "custom-tax"])(
    "closes a period without changing stored category id %j",
    async (taxCategoryId) => {
      const backendApi = createOpenkkBackendApi(
        await createMemoryDbAdapter(null),
        {
          userId: "user-1",
        },
      );
      const period = await backendApi.fiscalPeriods.create({
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      const journal: OpeningJournalApiRecord = {
        id: "reversal-1",
        date: period.startDate,
        description: "再振替",
        businessRate: 1,
        lines: [
          {
            id: "debit-1",
            side: "debit",
            bookAccountId: "acct_cash",
            amount: 100,
            partnerName: "取引先A",
            taxCategoryId,
            businessCategoryId: "",
          },
          {
            id: "credit-1",
            side: "credit",
            bookAccountId: "acct_sales",
            amount: 100,
            partnerName: "取引先B",
            taxCategoryId: "tax_out_of_scope",
            businessCategoryId: "biz_none",
          },
        ],
      };
      await backendApi.fiscalPeriods.start(period.id);
      await backendApi.fiscalPeriods.patch(period.id, {
        openingBalancesCompleted: true,
        opening: {
          balanceLines: [],
          journals: [journal],
        },
      });
      const accounts = await backendApi.masterData.getBookAccounts();
      const taxCategories = await backendApi.masterData.getTaxCategories();
      const businessCategories =
        await backendApi.masterData.getBusinessCategories();
      const carryover = mapOpeningJournalToRecord(
        journal,
        period.id,
        Object.fromEntries(
          accounts.map((account) => [account.id, account.name]),
        ),
        Object.fromEntries(
          accounts.map((account) => [account.id, account.accountType]),
        ),
        Object.fromEntries(
          taxCategories.map((category) => [category.id, category.name]),
        ),
        Object.fromEntries(
          businessCategories.map((category) => [category.id, category.name]),
        ),
      );
      const entries = buildClosingVirtualEntries({
        fiscalPeriodId: period.id,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: [],
        assets: [],
        carryovers: [carryover],
      }).map((entry) =>
        entryRecordToImportPayload(entry, {
          accounts,
          taxCategories,
          businessCategories,
        }),
      );

      await backendApi.preClosings.run(period.id);
      const closed = await backendApi.closings.run(period.id, entries);

      expect(closed.phase).toBe("post_closing");
      const saved = await backendApi.entries.getAll(period.id);
      expect(saved).toHaveLength(1);
      expect(saved[0]!.lines).toMatchObject(
        journal.lines.map(({ id: _id, ...line }) => line),
      );
    },
  );
});
