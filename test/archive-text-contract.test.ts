import { describe, expect, it } from "vitest";
import {
  buildFiscalPeriodArchivePayload,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
} from "../packages/client-domain/src/index.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { buildExpectedClosingEntries } from "../packages/server-domain/src/index.js";
import { createOpenkkServer } from "../packages/server/src/index.js";

describe("archive text preservation", () => {
  it.each([1, 2] as const)(
    "restores and re-exports long stored text from a version %i archive",
    async (version) => {
      const text = "保存済みの文字列".repeat(100);
      const db = await createMemoryDbAdapter(null);
      const source = createOpenkkServer(db, { userId: "user-1" });
      let period = await db.fiscalPeriods.create("user-1", {
        name: text,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      const lines = (["debit", "credit"] as const).map((side) => ({
        side,
        bookAccountId: side === "debit" ? "acct_cash" : "acct_sales",
        amount: 1000,
        partnerName: text,
        taxCategoryId: text,
        businessCategoryId: text,
      }));
      await db.fiscalPeriods.start(period.id);
      period = await db.fiscalPeriods.update(period.id, {
        openingBalancesCompleted: true,
        opening: {
          ...period.opening,
          openingJournals: [
            {
              id: "journal-1",
              date: period.startDate,
              description: text,
              businessRate: 1,
              lines: lines.map((line, index) => ({
                ...line,
                id: `line-${index}`,
              })),
            },
          ],
        },
      });
      await db.entries.create("user-1", period.id, {
        date: period.startDate,
        description: text,
        localId: "entry-1",
        businessRate: 1,
        lines,
      });
      await db.fixedAssets.create("user-1", period.id, {
        name: text,
        acquisitionDate: period.startDate,
        acquisitionCost: 120_000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 1,
        bookAccountId: "acct_equipment",
      });
      const payload = buildFiscalPeriodArchivePayload({
        createdAt: "2027-01-01T00:00:00.000Z",
        fiscalPeriod: period,
        entries: await source.entries.getAll(period.id),
        fixedAssets: await source.fixedAssets.getAll(period.id),
        closings: [],
      });
      payload.manifest.version = version;
      const target = createOpenkkServer(await createMemoryDbAdapter(null), {
        userId: "user-1",
      });
      const restored = await target.fiscalPeriods.importArchived(
        readFiscalPeriodArchiveZip(createFiscalPeriodArchiveZip(payload)),
      );
      const entries = await target.entries.getAll(restored.id);
      const fixedAssets = await target.fixedAssets.getAll(restored.id);

      expect(restored.name).toBe(text);
      expect(restored.opening.openingJournals[0]).toMatchObject({
        description: text,
        lines,
      });
      expect(entries[0]).toMatchObject({ description: text, lines });
      expect(fixedAssets[0]!.name).toBe(text);

      const reExported = buildFiscalPeriodArchivePayload({
        createdAt: "2027-01-01T00:00:00.000Z",
        fiscalPeriod: restored,
        entries,
        fixedAssets,
        closings: [],
      });
      const reimportedServer = createOpenkkServer(
        await createMemoryDbAdapter(null),
        {
          userId: "user-1",
        },
      );
      const reimported = await reimportedServer.fiscalPeriods.importArchived(
        readFiscalPeriodArchiveZip(createFiscalPeriodArchiveZip(reExported)),
      );
      expect(reimported.name).toBe(text);
      expect(
        await reimportedServer.entries.getAll(reimported.id),
      ).toMatchObject([{ description: text, lines }]);
      await target.preClosings.run({ fiscalPeriodId: restored.id, year: 2026 });
      const closed = await target.closings.run({
        fiscalPeriodId: restored.id,
        year: 2026,
        entries: buildExpectedClosingEntries({
          periodStartDate: restored.startDate,
          periodEndDate: restored.endDate,
          entries,
          fixedAssets,
          openingJournals: restored.opening.openingJournals,
          bookAccounts: await target.masterData.getBookAccounts(),
        }),
      });
      expect(closed.phase).toBe("post_closing");
      expect(await target.entries.getAll(restored.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            localId: "virtual:virtual-opening-carryover-journal-1",
            description: text,
            lines: expect.arrayContaining(
              lines.map((line) => expect.objectContaining(line)),
            ),
          }),
        ]),
      );
    },
  );
});
