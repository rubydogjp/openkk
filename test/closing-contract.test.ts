import { describe, expect, it } from "vitest";
import { buildClosingVirtualEntries } from "../packages/client-domain/src/index.js";
import { mapOpeningJournalToRecord } from "../packages/client-usecases/src/assist/assist-state-helpers.js";
import { entryRecordToImportPayload } from "../packages/client-usecases/src/entries/import-mapping.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { createOpenkkServer } from "../packages/server/src/index.js";
import type { OpeningJournalApiRecord } from "../packages/server-ports/src/index.js";

describe("client/server closing contract", () => {
  it.each(["", "tax_10", "custom-tax"])(
    "closes a period without changing stored category id %j",
    async (taxCategoryId) => {
      const server = createOpenkkServer(await createMemoryDbAdapter(null), {
        userId: "user-1",
      });
      const period = await server.fiscalPeriod.create({
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
      await server.fiscalPeriod.patch(period.id, {
        settingsCompleted: true,
        openingBalancesCompleted: true,
        opening: {
          id: period.opening!.id,
          userId: period.userId,
          fiscalPeriodId: period.id,
          openingBalanceLines: [],
          openingJournals: [journal],
        },
      });
      const accounts = await server.masterData.getBookAccounts();
      const taxes = await server.masterData.getTaxCategories();
      const businesses = await server.masterData.getBusinessCategories();
      const carryover = mapOpeningJournalToRecord(
        journal,
        period.id,
        Object.fromEntries(accounts.map((account) => [account.id, account.name])),
        Object.fromEntries(accounts.map((account) => [account.id, account.accountType])),
        Object.fromEntries(taxes.map((category) => [category.id, category.name])),
        Object.fromEntries(businesses.map((category) => [category.id, category.name])),
      );
      const entries = buildClosingVirtualEntries({
        fiscalPeriodId: period.id,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: [],
        assets: [],
        carryovers: [carryover],
      }).map((entry) => entryRecordToImportPayload(entry, { accounts, taxes, businesses }));

      await server.preClosing.run({ fiscalPeriodId: period.id, year: 2026 });
      const closed = await server.closing.run({
        fiscalPeriodId: period.id,
        year: 2026,
        entries,
      });

      expect(closed.phase).toBe("post_closing");
      const saved = await server.entries.getAll(period.id);
      expect(saved).toHaveLength(1);
      expect(saved[0]!.lines).toMatchObject(
        journal.lines.map(({ id: _id, ...line }) => line),
      );
    },
  );
});
