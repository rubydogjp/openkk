import { describe, expect, it } from "vitest";
import {
  buildClosingVirtualEntries,
  buildFiscalPeriodArchivePayload,
  computeFsAggregate,
  createFiscalPeriodArchiveZip,
  readFiscalPeriodArchiveZip,
  withClosingVirtualEntries,
} from "../packages/client-domain/src/index.js";
import { entryRecord } from "../packages/client-domain/test-support/entry-record.js";
import { mapFixedAsset } from "../packages/client-usecases/src/assist/assist-state-helpers.js";
import { entryRecordToImportPayload } from "../packages/client-usecases/src/entries/import-mapping.js";
import { createMemoryDbAdapter } from "../packages/memory-db-adapter/src/index.js";
import { createOpenkkServer } from "../packages/server/src/index.js";

describe("archived closing reports", () => {
  it.each((["active", "sold", "disposed"] as const).flatMap((status) =>
    ["PC", "資".repeat(400), "😀".repeat(200)].map((name) => ({ status, name, nameLength: name.length })),
  ))(
    "preserves closing amounts after restoring a $status asset with a $nameLength character name",
    async ({ status, name }) => {
      const server = createOpenkkServer(await createMemoryDbAdapter(null), {
        userId: "user-1",
      });
      const period = await server.fiscalPeriods.create({
        name: "2026年分",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      await server.fiscalPeriods.patch(period.id, {
        settingsCompleted: true,
        openingBalancesCompleted: true,
      });
      let asset = await server.fixedAssets.create(period.id, {
        name,
        acquisitionDate: "2026-01-01",
        acquisitionCost: 120_000,
        usefulLife: 4,
        depreciationMethod: "straight_line",
        businessRate: 0.5,
        bookAccountId: "acct_equipment",
      });
      if (status !== "active") {
        asset = await server.fixedAssets.patch(period.id, asset.id, {
          status,
          disposalDate: "2026-06-30",
          disposalPrice: status === "sold" ? 110_000 : null,
        });
      }
      const accounts = await server.masterData.getBookAccounts();
      const taxes = await server.masterData.getTaxCategories();
      const businesses = await server.masterData.getBusinessCategories();
      const today = new Date(2026, 11, 31);
      const preview = buildClosingVirtualEntries({
        fiscalPeriodId: period.id,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        entries: [],
        assets: [mapFixedAsset(asset, "工具器具備品", today, period.endDate)],
        carryovers: [],
      });
      expect(preview.every((entry) => entry.description.length <= 400)).toBe(true);
      expect(preview.every((entry) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(entry.description))).toBe(true);
      await server.preClosings.run({ fiscalPeriodId: period.id, year: 2026 });
      await server.closings.run({
        fiscalPeriodId: period.id,
        year: 2026,
        entries: preview.map((entry) =>
          entryRecordToImportPayload(entry, { accounts, taxes, businesses }),
        ),
      });
      const closed = await server.fiscalPeriods.patch(period.id, {
        documentsReceivedCompleted: true,
      });
      const zip = createFiscalPeriodArchiveZip(buildFiscalPeriodArchivePayload({
        createdAt: today.toISOString(),
        fiscalPeriod: closed,
        entries: await server.entries.getAll(period.id),
        fixedAssets: [asset],
        closings: ["pre_closing", "closing"].map((kind) => ({
          fiscalPeriodId: period.id,
          year: 2026,
          kind,
        })),
      }));
      const restoredServer = createOpenkkServer(await createMemoryDbAdapter(null), {
        userId: "user-1",
      });
      const restored = await restoredServer.fiscalPeriods.importArchived(
        readFiscalPeriodArchiveZip(zip),
      );
      const restoredAssets = await restoredServer.fixedAssets.getAll(restored.id);
      expect(restoredAssets[0]!.id).not.toBe(asset.id);
      const entries = (await restoredServer.entries.getAll(restored.id)).map((entry) =>
        entryRecord({
          ...entry,
          lines: entry.lines.map((line) => ({
            ...line,
            accountName: accounts.find((account) => account.id === line.bookAccountId)!.name,
            accountType: accounts.find((account) => account.id === line.bookAccountId)!.accountType,
            amount: String(line.amount),
            taxCategoryName: null,
            businessCategoryName: null,
          })),
        }),
      );
      const reportEntries = withClosingVirtualEntries({
        fiscalPeriodId: restored.id,
        phase: restored.phase,
        periodStartDate: restored.startDate,
        periodEndDate: restored.endDate,
        entries,
        assets: restoredAssets.map((item) =>
          mapFixedAsset(item, "工具器具備品", today, restored.endDate),
        ),
        carryovers: [],
      });

      expect(reportEntries).toEqual(entries);
      expect(computeFsAggregate({ entries: reportEntries, openingBalanceLines: [] })).toEqual(
        computeFsAggregate({ entries: preview, openingBalanceLines: [] }),
      );
    },
  );
});
